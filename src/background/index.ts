// background service worker：消息路由 + 发布执行
import type { SyncData } from "~sync/common"
import { createTabsForPlatforms } from "~sync/platforms"
import { fetchTweetMedia } from "./syndication"

let currentSyncData: SyncData | null = null
let currentGroupId: number | undefined
let currentPublishPopup: chrome.windows.Window | null = null

// ---------- HTML 渲染引擎：扩展渲染窗口管理 ----------
// 渲染窗口是一个小的扩展页面（真实渲染器环境，rAF/布局/字体都正常），
// 首次使用 HTML 引擎时创建一次并保活；被用户关闭后会自动重建。
let renderWindowId: number | null = null

async function ensureRenderWindow() {
  if (renderWindowId !== null) {
    try {
      await chrome.windows.get(renderWindowId)
      return
    } catch {
      renderWindowId = null // 已被关闭，重建
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("tabs/card-render.html"),
    type: "popup",
    width: 240,
    height: 100,
    focused: false
  })
  if (win.id !== undefined) {
    renderWindowId = win.id
    // 关闭事件里清理记录，下次请求自动重建
    chrome.windows.onRemoved.addListener(function onRemoved(windowId) {
      if (windowId === renderWindowId) {
        renderWindowId = null
        chrome.windows.onRemoved.removeListener(onRemoved)
      }
    })
  }
  // 等页面脚本就绪
  await new Promise((resolve) => setTimeout(resolve, 500))
}

async function relayToRenderWindow(payload: Record<string, unknown>): Promise<unknown> {
  const send = () =>
    chrome.runtime.sendMessage({ action: "X_DIST_HTML_RENDER", ...payload })
  try {
    return await send()
  } catch (first) {
    const message = String(first)
    if (message.includes("Receiving end") || message.includes("message channel closed") || message.includes("asynchronous response")) {
      // 渲染窗口刚创建/被关闭/卡死：重建后再试一次
      console.warn("[card-render] HTML 渲染窗口无响应，重建后重试")
      renderWindowId = null
      await ensureRenderWindow()
      return await send()
    }
    throw first
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "X_DIST_FETCH_TWEET_MEDIA") {
    fetchTweetMedia(String(request.tweetId))
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ ok: false, error: String(error), images: [], video: null, videoPoster: null })
      })
    return true
  }

  // 代抓图片并转 data URL（分享卡片的头像用，避开内容脚本的 CORS 限制）
  if (request.action === "X_DIST_FETCH_IMAGE_DATA") {
    ;(async () => {
      try {
        const response = await fetch(String(request.url), { credentials: "omit" })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const blob = await response.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error("FileReader 读取失败"))
          reader.readAsDataURL(blob)
        })
        sendResponse({ ok: true, dataUrl })
      } catch (error) {
        sendResponse({ ok: false, error: String(error) })
      }
    })()
    return true
  }

  // 分享卡片渲染（HTML 引擎）：转发到扩展渲染窗口执行
  if (request.action === "X_DIST_RENDER_CARDS" && request.engine === "html") {
    ;(async () => {
      try {
        await ensureRenderWindow()
        const res = await relayToRenderWindow({
          input: request.input,
          config: request.config,
          page: request.page
        })
        sendResponse(res ?? { ok: false, error: "渲染窗口无响应" })
      } catch (error) {
        console.error("[card-render] HTML 渲染链路失败", error)
        sendResponse({ ok: false, error: String(error) })
      }
    })()
    return true
  }

  if (request.action === "X_DIST_OPEN_PUBLISH") {
    currentSyncData = request.data as SyncData
    ;(async () => {
      // 复用同一个发布进度小窗，避免重复发布时开多个
      if (currentPublishPopup?.id) {
        try {
          await chrome.windows.remove(currentPublishPopup.id)
        } catch {
          // 窗口可能已被用户关闭
        }
      }
      currentPublishPopup = await chrome.windows.create({
        url: chrome.runtime.getURL("tabs/publish.html"),
        type: "popup",
        width: 460,
        height: 560
      })
    })()
    sendResponse({ status: "received" })
    return true
  }

  if (request.action === "X_DIST_PUBLISH_REQUEST_SYNC_DATA") {
    sendResponse({ syncData: currentSyncData })
    return true
  }

  // 一键关闭本次分发的标签组（发布完成后，从进度小窗触发）
  if (request.action === "X_DIST_CLOSE_GROUP") {
    ;(async () => {
      try {
        if (!currentGroupId) {
          sendResponse({ closed: 0 })
          return
        }
        const groupTabs = await chrome.tabs.query({ groupId: currentGroupId })
        const tabIds = groupTabs.map((t) => t.id!).filter(Boolean)
        await chrome.tabs.remove(tabIds)
        currentGroupId = undefined
        sendResponse({ closed: tabIds.length })
      } catch (error) {
        sendResponse({ error: String(error) })
      }
    })()
    return true
  }

  if (request.action === "X_DIST_PUBLISH_NOW") {
    const data = request.data as SyncData
    if (Array.isArray(data.platforms) && data.platforms.length > 0) {
      ;(async () => {
        try {
          const { tabs, groupId } = await createTabsForPlatforms(data)
          currentGroupId = groupId
          if (currentPublishPopup?.id) {
            await chrome.windows.update(currentPublishPopup.id, { focused: true })
          }
          sendResponse({ tabs, groupId })
        } catch (error) {
          console.error("创建标签页或分组时出错:", error)
          sendResponse({ error: String(error) })
        }
      })()
    } else {
      sendResponse({ error: "未选择任何平台" })
    }
    return true
  }

  return false
})
