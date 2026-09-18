import type { DynamicData, SyncData } from "../common"

// 抖音图文帖发布适配器
// 注意：此函数会经 chrome.scripting.executeScript({func}) 序列化后在
// creator.douyin.com 页面内执行，必须自包含，不能引用外部作用域。
export async function DynamicDouyin(data: SyncData) {
  const { title, content, images, tags } = data.data as DynamicData
  // 辅助函数：等待元素出现
  function waitForElement(selector: string, timeout = 10000): Promise<Element> {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector)
      if (element) {
        resolve(element)
        return
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector)
        if (element) {
          resolve(element)
          observer.disconnect()
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true
      })

      setTimeout(() => {
        observer.disconnect()
        reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms`))
      }, timeout)
    })
  }

  if (!images || images.length === 0) {
    console.error("发布抖音图文需要至少一张图片")
    return
  }

  await waitForElement('input[type="file"]')
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const semiTabs = document.querySelector(".semi-tabs.semi-tabs-top")
  if (!semiTabs || !semiTabs.previousElementSibling) {
    console.error("未找到 semitabs 或其前置元素")
    return
  }
  const tabsDiv = semiTabs.previousElementSibling.querySelectorAll("div")
  const publishTab = Array.from(tabsDiv).find((e) => e.textContent === "发布图文")
  if (!publishTab) {
    console.error("未找到「发布图文」tab")
    return
  }
  ;(publishTab as HTMLDivElement).click()
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const fileInput = document.querySelector(
    'input[accept="image/png,image/jpeg,image/jpg,image/bmp,image/webp,image/tif"]'
  ) as HTMLInputElement
  if (!fileInput) {
    console.error("未找到图片上传 input")
    return
  }

  const dataTransfer = new DataTransfer()
  for (const fileInfo of images) {
    const response = await fetch(fileInfo.url)
    const blob = await response.blob()
    const file = new File([blob], fileInfo.name, { type: fileInfo.type })
    dataTransfer.items.add(file)
  }
  fileInput.files = dataTransfer.files
  fileInput.dispatchEvent(new Event("change", { bubbles: true }))
  fileInput.dispatchEvent(new Event("input", { bubbles: true }))

  await waitForElement('input[placeholder="添加作品标题"]')
  const titleInput = document.querySelector('input[placeholder="添加作品标题"]') as HTMLInputElement
  if (titleInput) {
    titleInput.value = title || ""
    titleInput.dispatchEvent(new Event("input", { bubbles: true }))
  }

  const contentEditor = document.querySelector(
    'div.zone-container.editor-kit-container.editor.editor-comp-publish[contenteditable="true"]'
  ) as HTMLDivElement
  if (contentEditor) {
    contentEditor.focus()
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer()
    })

    pasteEvent.clipboardData.setData("text/plain", content || "")
    contentEditor.dispatchEvent(pasteEvent)

    // 抖音话题限制 4 个，以 #tag 方式追加到末尾
    if (tags?.length) {
      for (const tag of tags.slice(0, 4)) {
        contentEditor.focus()
        const tagPaste = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer()
        })
        tagPaste.clipboardData?.setData("text/plain", ` #${tag}`)
        contentEditor.dispatchEvent(tagPaste)
        await new Promise((resolve) => setTimeout(resolve, 600))
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 5000))

  if (data.isAutoPublish) {
    const buttons = document.querySelectorAll("button")
    const publishButton = Array.from(buttons).find((e) => e.textContent === "发布")
    if (publishButton) {
      ;(publishButton as HTMLButtonElement).click()
      await new Promise((resolve) => setTimeout(resolve, 10000))
      window.location.href = "https://creator.douyin.com/creator-micro/content/manage"
    } else {
      console.error("未找到「发布」按钮")
    }
  }
}
