import type { DynamicData, FileData, SyncData } from "../common"

// 微博图文/纯文字帖发布适配器
// 此函数在 weibo.com 首页页面内执行，必须自包含。
// 实测（2026-11）：首页发布框 textarea[placeholder="有什么新鲜事想分享给大家？"]
//   + 「发送」按钮（无内容时 disabled）；图片走工具栏图片按钮触发的 input[type=file]。
export async function DynamicWeibo(data: SyncData) {
  const { title, content, images, tags } = data.data as DynamicData
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  function waitForElement(selector: string, timeout = 15000): Promise<Element | null> {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector)
      if (existing) {
        resolve(existing)
        return
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector)
        if (el) {
          if (timer) clearTimeout(timer)
          observer.disconnect()
          resolve(el)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      timer = setTimeout(() => {
        observer.disconnect()
        console.warn(`[X分发] 微博：元素 "${selector}" 在 ${timeout}ms 内未出现`)
        resolve(null)
      }, timeout)
    })
  }

  function findByText(selector: string, text: string): HTMLElement | null {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
    return nodes.find((el) => (el.textContent || "").trim() === text) ?? null
  }

  async function fillContent(): Promise<HTMLTextAreaElement | null> {
    const editor = (await waitForElement(
      'textarea[placeholder*="有什么新鲜事"]',
      15000
    )) as HTMLTextAreaElement | null
    if (!editor) {
      console.error("[X分发] 微博：首页发布框未找到")
      return null
    }
    const tagSuffix = tags?.length ? ` ${tags.map((t) => `#${t}#`).join(" ")}` : ""
    const text = `${title ? `${title}\n` : ""}${content || ""}${tagSuffix}`.slice(0, 2000)
    // 微博发布框是 React 受控组件，paste 事件无效；必须用 native value setter 直接赋值
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    editor.focus()
    if (valueSetter) {
      valueSetter.call(editor, text)
    } else {
      editor.value = text
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    editor.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(400)
    return editor
  }

  async function prepareFiles(fileInfos: FileData[]): Promise<File[]> {
    const files: File[] = []
    for (const info of fileInfos.slice(0, 9)) {
      try {
        const response = await fetch(info.url)
        if (!response.ok) continue
        const blob = await response.blob()
        files.push(new File([blob], info.name, { type: info.type || blob.type || "image/png" }))
      } catch (error) {
        console.error(`[X分发] 微博：读取图片 ${info.name} 失败:`, error)
      }
    }
    return files
  }

  // 统计发布框内已附着的图片预览数量（微博预览图 src 可能是 blob:/data:/http，用 img 数量兜底）
  function countAttachedImages(): number {
    const editor = document.querySelector('textarea[placeholder*="有什么新鲜事"]') as HTMLTextAreaElement | null
    const root = editor?.closest("div")?.parentElement?.parentElement ?? document
    return root.querySelectorAll("img").length
  }

  async function uploadImages(files: File[]): Promise<void> {
    if (files.length === 0) return
    const before = countAttachedImages()

    // 只走一条路径：粘贴文件到发布框（实测微博首页支持图片粘贴）。
    // 绝不重复走 file input —— 之前两条都执行导致图片被塞两遍（3 张变 6 张）。
    try {
      const editor = document.querySelector('textarea[placeholder*="有什么新鲜事"]') as HTMLTextAreaElement | null
      if (editor) {
        const transfer = new DataTransfer()
        files.forEach((f) => transfer.items.add(f))
        editor.focus()
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer
          })
        )
        await sleep(3500)
      }
    } catch (error) {
      console.warn("[X分发] 微博：粘贴图片失败:", error)
    }

    // 仅当粘贴完全没效果时，才用 file input 兜底一次
    const after = countAttachedImages()
    if (after - before < files.length) {
      console.warn("[X分发] 微博：粘贴未生效，尝试 file input 兜底")
      const imageBtn =
        findByText("div, a, button", "图片") ||
        Array.from(document.querySelectorAll<HTMLElement>("[node-type], [aria-label], [title]")).find((el) =>
          /图片|image|photo/i.test(`${el.getAttribute("node-type") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`)
        )
      if (imageBtn) {
        imageBtn.click()
        await sleep(800)
      }
      const input = (await waitForElement('input[type="file"]', 8000)) as HTMLInputElement | null
      if (input) {
        const transfer = new DataTransfer()
        files.forEach((f) => transfer.items.add(f))
        input.files = transfer.files
        input.dispatchEvent(new Event("change", { bubbles: true }))
        input.dispatchEvent(new Event("input", { bubbles: true }))
        await sleep(3000)
      }
    }
  }

  try {
    await fillContent()

    if (images && images.length > 0) {
      const files = await prepareFiles(images)
      await uploadImages(files)
    }

    if (data.isAutoPublish) {
      await sleep(1500)
      const editor = document.querySelector('textarea[placeholder*="有什么新鲜事"]') as HTMLTextAreaElement | null
      const hasContent = editor && editor.value.trim().length > 0
      const sendButton = findByText("button", "发送") as HTMLButtonElement | null
      if (sendButton && hasContent) {
        let attempts = 0
        while (sendButton.disabled && attempts < 10) {
          await sleep(2000)
          attempts++
        }
        if (!sendButton.disabled) {
          sendButton.click()
        } else {
          console.error("[X分发] 微博：发送按钮仍不可用，跳过自动发布")
        }
      } else {
        console.error("[X分发] 微博：未找到发送按钮或内容为空，跳过自动发布")
      }
    }
  } catch (error) {
    console.error("[X分发] 微博图文发布过程中出错:", error)
  }
}
