import type { SyncData, VideoData } from "../common"

// 微博视频帖发布适配器
// 此函数在 weibo.com/upload/channel 页面内执行，必须自包含。
// 实测（2026-11）：进入页只有「上传视频」按钮 + 拖拽区 → 上传后展开表单：
//   类型（原创/二创/转载，必填）/ 标题（≤30字）/ 封面（默认已选，可跳过）
//   / 分类（下拉必选）/ 页尾「设置微博内容」textarea + 「发布」按钮
// 顶部「≥1080P、时长≥1分钟」为曝光激励提示，非硬性限制（6秒视频实测可上传）。
// 注意：微博预渲染了隐藏的表单元素，判断上传成功必须用「可见性」而非 DOM 存在性。
export async function VideoWeibo(data: SyncData) {
  const { title, content, video, tags } = data.data as VideoData
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  // 等待元素，超时返回 null 不抛错
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

  // 构造携带文件的 DataTransfer（拖放与 file input 共用）
  function makeTransfer(file: File): DataTransfer {
    const transfer = new DataTransfer()
    transfer.items.add(file)
    return transfer
  }

  function isVisible(el: Element | null): boolean {
    if (!el) return false
    if (el.getClientRects().length === 0) return false
    const style = getComputedStyle(el)
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
  }

  function formVisible(): boolean {
    return isVisible(document.querySelector('input[placeholder*="填写标题"]'))
  }

  // 上传真正成功的判断：表单可见，或有可见的上传完成文案
  function uploadStarted(): boolean {
    if (formVisible()) return true
    return /上传完成|正在上传|上传中/.test(document.body.innerText || "")
  }

  // 上传视频：实测拖拽到上传区可可靠触发微博上传流程。
  // 依次尝试「拖放事件 → 点原始按钮（hook 拦截文件选择）→ 直接塞 file input」，
  // 每步都用可见性验证，避免被预渲染的隐藏表单误判。
  async function uploadVideo(file: File): Promise<boolean> {
    const w = window as unknown as { showOpenFilePicker?: (...args: unknown[]) => Promise<unknown[]> }

    // Hook 1：拦截隐藏 input[type=file].click()，注入文件并阻止原生文件框
    const originalClick = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.type === "file") {
        try {
          const transfer = makeTransfer(file)
          Object.defineProperty(this, "files", { value: transfer.files, writable: true, configurable: true })
          this.dispatchEvent(new Event("change", { bubbles: true }))
          this.dispatchEvent(new Event("input", { bubbles: true }))
        } catch (error) {
          console.error("[X分发] 微博：注入 input.click() 失败:", error)
        }
        return
      }
      return originalClick.call(this)
    }

    // Hook 2：拦截 showOpenFilePicker（File System Access API），返回只读文件句柄
    const originalPicker = w.showOpenFilePicker
    if (typeof w.showOpenFilePicker === "function") {
      w.showOpenFilePicker = async () =>
        [
          {
            name: file.name,
            kind: "file",
            getFile: async () => file,
            createWritable: async () => {
              throw new Error("readonly")
            }
          }
        ] as unknown as FileSystemFileHandle[]
    }

    const restoreHooks = () => {
      HTMLInputElement.prototype.click = originalClick
      if (originalPicker) w.showOpenFilePicker = originalPicker
      else delete w.showOpenFilePicker
    }

    // 找拖拽目标：包含「拖拽视频到此处」文字的元素及其祖先容器
    const dropHint = Array.from(document.querySelectorAll<HTMLElement>("*")).find((el) => {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent || "").trim())
        .join("")
      return own.includes("拖拽视频到此处") || own.includes("拖拽视频")
    })
    const dropTargets: HTMLElement[] = []
    if (dropHint) {
      let el: HTMLElement | null = dropHint
      for (let i = 0; i < 4 && el; i++) {
        dropTargets.push(el)
        el = el.parentElement
      }
    }

    // 路径 A：拖放事件（微博明确支持「拖拽视频到此处也可上传」）
    if (dropTargets.length > 0) {
      const transfer = makeTransfer(file)
      for (const target of dropTargets) {
        try {
          for (const type of ["dragenter", "dragover", "drop"]) {
            target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
          }
          await sleep(1000)
          if (uploadStarted()) {
            restoreHooks()
            return true
          }
        } catch (error) {
          console.warn("[X分发] 微博：拖拽尝试失败:", error)
        }
      }
    }

    // 路径 B：点击原始「上传视频」按钮（hook 拦截其文件选择）
    const uploadBtn =
      findByText("button", "上传视频") ??
      (Array.from(document.querySelectorAll<HTMLElement>("button, div, span")).find((el) =>
        (el.textContent || "").trim() === "上传视频"
      ) as HTMLElement | null)
    if (uploadBtn) {
      uploadBtn.click()
      await sleep(2500)
      if (uploadStarted()) {
        restoreHooks()
        return true
      }
    }

    // 路径 C：直接塞 file input（native setter，确保 React 受控组件收到）
    const anyInput = document.querySelector('input[type="file"]') as HTMLInputElement | null
    if (anyInput) {
      try {
        const transfer = makeTransfer(file)
        const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set
        if (filesSetter) filesSetter.call(anyInput, transfer.files)
        else anyInput.files = transfer.files
        anyInput.dispatchEvent(new Event("change", { bubbles: true }))
        anyInput.dispatchEvent(new Event("input", { bubbles: true }))
      } catch (error) {
        console.warn("[X分发] 微博：直接塞 input 失败:", error)
      }
    }

    // 等待上传真正开始（表单可见 / 上传完成文案可见），最多 60 秒
    const deadline = Date.now() + 60000
    while (Date.now() < deadline && !uploadStarted()) {
      await sleep(1000)
    }

    restoreHooks()
    return uploadStarted()
  }

  // 上传完成后表单才会可见：必须等标题框可见（微博预渲染隐藏表单）
  async function waitForForm(): Promise<boolean> {
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      if (formVisible()) {
        await sleep(1500) // 等封面帧生成完毕
        return true
      }
      await sleep(1000)
    }
    console.error("[X分发] 微博：上传后表单始终不可见（上传未完成）")
    return false
  }

  function fillTitle(): void {
    const input = document.querySelector('input[placeholder*="填写标题"]') as HTMLInputElement | null
    if (!input) return
    const value = (title || content || "").replace(/\s+/g, " ").trim().slice(0, 30)
    if (!value) return
    // React 受控组件：必须用 native value setter，直接 .value= 不触发 state 更新
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    input.focus()
    if (valueSetter) valueSetter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
    input.blur()
  }

  // 找文本匹配的最小叶子元素（微博自定义组件的选项/单选多是无语义标签）
  function findLeafByText(text: string): HTMLElement | null {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    const matches: HTMLElement[] = []
    while (walker.nextNode()) {
      const el = walker.currentNode as HTMLElement
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent || "").trim())
        .join("")
      if (own === text) matches.push(el)
    }
    return matches.sort((a, b) => a.getElementsByTagName("*").length - b.getElementsByTagName("*").length)[0] ?? null
  }

  function selectType(): void {
    const labels = Array.from(document.querySelectorAll<HTMLElement>("label"))
    const originLabel = labels.find((el) => (el.textContent || "").includes("原创"))
    const origin = originLabel ?? findLeafByText("原创")
    if (origin) {
      origin.click()
    } else {
      console.warn("[X分发] 微博：未找到「原创」类型选项，请手动选择")
    }
  }

  // 递归收集 document 及所有 iframe / shadow root 里的元素
  function collectAllElements(root: Document | ShadowRoot): HTMLElement[] {
    const result: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>("*"))
    for (const el of [...result]) {
      if (el.shadowRoot) result.push(...Array.from(el.shadowRoot.querySelectorAll<HTMLElement>("*")))
    }
    for (const frame of Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"))) {
      try {
        const doc = frame.contentDocument
        if (doc) result.push(...Array.from(doc.querySelectorAll<HTMLElement>("*")))
      } catch {
        // 跨域 iframe 跳过
      }
    }
    return result
  }

  async function selectCategory(): Promise<void> {
    const allBefore = collectAllElements(document)
    const placeholder =
      allBefore.find((el) => (el.textContent || "").trim() === "请选择合适的频道") ??
      allBefore.find((el) => (el.textContent || "").includes("请选择合适的频道"))
    if (!placeholder) {
      console.warn("[X分发] 微博：未找到分类下拉，请手动选择")
      return
    }
    placeholder.click()
    await sleep(1200)

    const allAfter = collectAllElements(document)
    const clickCategory = (names: string[]): boolean => {
      for (const name of names) {
        const candidates = allAfter.filter((el) => {
          const t = (el.textContent || "").trim()
          return t === name || (t.length <= name.length + 2 && t.includes(name))
        })
        if (candidates.length > 0) {
          const leaf = candidates.sort((a, b) => a.getElementsByTagName("*").length - b.getElementsByTagName("*").length)[0]
          leaf.click()
          return true
        }
      }
      return false
    }

    // 两级结构：先点大类（VLOG/生活/游戏…），再点子类（旅行/美食/时尚…）
    const bigCats = ["VLOG", "生活", "游戏", "美食", "旅行", "时尚", "知识"]
    const subCats = ["旅行", "美食", "时尚美妆", "好物分享", "日常", "游戏", "运动", "搞笑", "音乐", "影视", "评测", "科技", "汽车", "二次元"]
    if (clickCategory(bigCats)) {
      await sleep(700)
      clickCategory(subCats)
      await sleep(800)
      return
    }
    // 兜底：原生 select 或任意 option/li
    const select = document.querySelector("select") as HTMLSelectElement | null
    if (select && select.options.length > 1) {
      select.selectedIndex = 1
      select.dispatchEvent(new Event("change", { bubbles: true }))
      return
    }
    const option = allAfter.find((el) => {
      const t = (el.textContent || "").trim()
      return (
        (el.matches('[role="option"], li, [class*="option"]') || el.getAttribute("role") === "option") &&
        t && t.length < 20 && t !== "请选择合适的频道"
      )
    })
    if (option) {
      option.click()
    } else {
      console.warn("[X分发] 微博：未能自动选择分类，请手动选择")
    }
  }

  async function fillContent(): Promise<void> {
    const editor = (await waitForElement('textarea[placeholder*="有什么新鲜事"]', 10000)) as HTMLTextAreaElement | null
    if (!editor) {
      console.warn("[X分发] 微博：未找到正文输入框")
      return
    }
    const tagSuffix = tags?.length ? ` ${tags.map((t) => `#${t}#`).join(" ")}` : ""
    const text = `${content || ""}${tagSuffix}`.slice(0, 2000)
    if (!text) return
    // React 受控组件：native value setter（与图文适配器同款修复）
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    editor.focus()
    if (valueSetter) valueSetter.call(editor, text)
    else editor.value = text
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    editor.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(300)
  }

  try {
    if (!video) {
      console.error("[X分发] 微博：没有视频文件")
      return
    }
    // video.url 是发布进度小窗生成的 blob: URL
    const response = await fetch(video.url)
    if (!response.ok) throw new Error(`读取视频失败: HTTP ${response.status}`)
    const blob = await response.blob()
    const file = new File([blob], video.name, { type: video.type || blob.type || "video/mp4" })

    const uploaded = await uploadVideo(file)
    if (!uploaded) return

    const ready = await waitForForm()
    if (!ready) return

    selectType()
    fillTitle()
    await selectCategory()
    await fillContent()

    if (data.isAutoPublish) {
      await sleep(2000)
      // 发布按钮可能是 button 或带 woo-button 的 div/span，用文本精确匹配
      const publishButton =
        findByText("button", "发布") ??
        (Array.from(document.querySelectorAll<HTMLElement>("button, div, span")).find((el) => {
          const t = (el.textContent || "").trim()
          return t === "发布" && (el.className || "").toString().includes("button")
        }) as HTMLElement | null)
      if (!publishButton) {
        console.error("[X分发] 微博：未找到「发布」按钮")
        return
      }
      // 类型/分类未填时按钮 disabled，等待其可用
      let attempts = 0
      const isDisabled = () =>
        (publishButton as HTMLButtonElement).disabled ||
        publishButton.getAttribute("aria-disabled") === "true" ||
        String(publishButton.className).includes("disabled")
      while (isDisabled() && attempts < 15) {
        await sleep(2000)
        attempts++
      }
      if (isDisabled()) {
        console.error("[X分发] 微博：发布按钮仍不可用（必填项可能未填全），跳过自动发布")
        return
      }
      publishButton.click()
    }
  } catch (error) {
    console.error("[X分发] 微博视频发布过程中出错:", error)
  }
}
