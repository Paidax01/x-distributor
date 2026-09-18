import type { SyncData, VideoData } from "../common"

// 移植自 MultiPost-Extension src/sync/video/douyin.ts（去掉定时发布与封面选择）
// 此函数在 creator.douyin.com 页面内执行，必须自包含。
export async function VideoDouyin(data: SyncData) {
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

  async function uploadVideo(file: File): Promise<void> {
    const fileInput = (await waitForElement("input[type=file]")) as HTMLInputElement

    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    fileInput.files = dataTransfer.files

    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    fileInput.dispatchEvent(new Event("input", { bubbles: true }))
  }

  try {
    const { content, video, title, tags } = data.data as VideoData
    if (video) {
      const response = await fetch(video.url)
      const blob = await response.blob()
      const videoFile = new File([blob], video.name, { type: video.type })

      await uploadVideo(videoFile)
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 处理标题输入
    const titleInput = (await waitForElement('input[placeholder*="作品标题"]')) as HTMLInputElement
    if (titleInput) {
      titleInput.value = title || content.slice(0, 20)
      titleInput.dispatchEvent(new Event("input", { bubbles: true }))
    }

    // 填写内容和标签
    const contentEditor = (await waitForElement(
      'div.zone-container.editor-kit-container.editor.editor-comp-publish[contenteditable="true"]'
    )) as HTMLDivElement
    if (contentEditor) {
      contentEditor.focus()
      const contentPasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      })

      contentPasteEvent.clipboardData.setData("text/plain", `${content} `)
      contentEditor.dispatchEvent(contentPasteEvent)

      if (tags && tags.length > 0) {
        for (const tag of tags.slice(0, 5)) {
          contentEditor.focus()

          const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer()
          })

          pasteEvent.clipboardData.setData("text/plain", ` #${tag}`)
          contentEditor.dispatchEvent(pasteEvent)

          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    if (data.isAutoPublish === true) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const buttons = document.querySelectorAll("button")
      const publishButton = Array.from(buttons).find((button) => button.textContent === "发布")

      if (publishButton) {
        ;(publishButton as HTMLElement).click()
      } else {
        console.error('未找到"发布"按钮')
      }
    }
  } catch (error) {
    console.error("抖音视频发布过程中出错:", error)
  }
}
