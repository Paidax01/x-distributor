import type { SyncData, VideoData } from "../common"

// 即刻视频帖发布适配器
// 此函数在 web.okjike.com 页面内执行，必须自包含。
// 即刻的 composer 是 contenteditable 富文本编辑器（没有 textarea）：
// 文案用模拟粘贴事件填入，视频文件同样以「粘贴文件」方式上传（file input 仅兜底）。
// 处理顺序：先文本，后视频。
export async function VideoOkjike(data: SyncData) {
  const { title, content, video } = data.data as VideoData
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  // 等待元素，超时不抛错返回 null
  function waitForElement(selector: string, timeout = 15000): Promise<Element | null> {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector)
      if (existing) {
        resolve(existing)
        return
      }
      let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector)
        if (element) {
          if (timeoutId) clearTimeout(timeoutId)
          observer.disconnect()
          resolve(element)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      timeoutId = setTimeout(() => {
        observer.disconnect()
        console.warn(`[X分发] Element with selector "${selector}" not found within ${timeout}ms`)
        resolve(null)
      }, timeout)
    })
  }

  function getUploadingStatus() {
    return Array.from(document.querySelectorAll('div[role="status"]')).find((element) =>
      element.textContent?.includes("正在上传")
    )
  }

  async function waitForUploadToFinish(timeout = 120000, interval = 500): Promise<boolean> {
    const deadline = Date.now() + timeout
    const firstCheckDeadline = Date.now() + 3000
    let sawUploading = false
    while (Date.now() < deadline) {
      const uploadingStatus = getUploadingStatus()
      if (uploadingStatus) {
        sawUploading = true
        await sleep(interval)
        continue
      }
      if (sawUploading || Date.now() >= firstCheckDeadline) {
        return true
      }
      await sleep(250)
    }
    return !getUploadingStatus()
  }

  // 填写文案：等待编辑器 → 模拟粘贴纯文本（与图文版同款，已验证可用）
  async function fillContent(): Promise<HTMLElement | null> {
    const editor = (await waitForElement(
      'form div[contenteditable="true"], div[contenteditable="true"][role="textbox"]'
    )) as HTMLDivElement | null
    if (!editor) {
      console.error("[X分发] 即刻编辑器未找到")
      return null
    }
    const fullContent = title ? `${title}\n${content}` : content
    editor.focus()
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer()
    })
    pasteEvent.clipboardData.setData("text/plain", fullContent)
    editor.dispatchEvent(pasteEvent)
    await sleep(500)
    return editor
  }

  // 上传视频：优先「向编辑器粘贴视频文件」，失败再退回 input[type=file]
  async function uploadVideo(editor: HTMLElement) {
    if (!video) {
      console.error("[X分发] 没有视频文件")
      return
    }

    const dataTransfer = new DataTransfer()
    try {
      // video.url 是扩展发布页生成的 blob: URL（媒体已在发布页完成下载）
      const response = await fetch(video.url)
      if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`)
      const blob = await response.blob()
      const file = new File([blob], video.name, { type: video.type || "video/mp4" })
      dataTransfer.items.add(file)
    } catch (error) {
      console.error("[X分发] 读取视频失败（发布进度小窗被提前关闭会导致 blob 失效）:", error)
      return
    }

    // 路径 1：向编辑器粘贴视频文件
    try {
      editor.focus()
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      })
      editor.dispatchEvent(pasteEvent)
      await waitForUploadToFinish()
      // 编辑器内出现视频预览即认为成功
      const root = editor.closest("form") || editor.closest('[role="dialog"]') || editor.parentElement
      if (root && root.querySelector("video")) {
        return
      }
      console.warn("[X分发] 粘贴视频未在编辑器中出现，尝试 file input 兜底")
    } catch (error) {
      console.warn("[X分发] 粘贴视频失败，尝试 file input 兜底:", error)
    }

    // 路径 2：file input 兜底（任意 accept 的第一个文件输入）
    const fileInput = (await waitForElement('input[type="file"]', 10000)) as HTMLInputElement | null
    if (!fileInput) {
      console.error("[X分发] 未找到即刻的文件输入元素")
      return
    }
    const inputTransfer = new DataTransfer()
    try {
      const response = await fetch(video.url)
      const blob = await response.blob()
      inputTransfer.items.add(new File([blob], video.name, { type: video.type || "video/mp4" }))
    } catch (error) {
      console.error("[X分发] file input 兜底读取视频失败:", error)
      return
    }
    fileInput.files = inputTransfer.files
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    fileInput.dispatchEvent(new Event("input", { bubbles: true }))
    await waitForUploadToFinish()
  }

  // 主流程：先文本，后视频；单步失败不阻断另一步
  try {
    const editor = await fillContent()
    if (!editor) return
    try {
      await uploadVideo(editor)
    } catch (error) {
      console.error("[X分发] 即刻视频上传失败:", error)
    }

    if (data.isAutoPublish) {
      await sleep(3000)
      const buttons = document.querySelectorAll("button")
      const publishButton = Array.from(buttons).find((button) =>
        button.textContent?.includes("发布")
      ) as HTMLButtonElement

      if (publishButton) {
        let attempts = 0
        while (publishButton.disabled && attempts < 10) {
          await sleep(3000)
          attempts++
        }

        if (publishButton.disabled) {
          console.error("发布按钮在10次尝试后仍被禁用")
          return
        }

        publishButton.click()
      }
    }
  } catch (error) {
    console.error("发布过程中出错:", error)
  }
}
