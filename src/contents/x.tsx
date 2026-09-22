import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { createRoot } from "react-dom/client"
import { DistributePanel } from "~components/DistributePanel"
import { bus } from "~utils/bus"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"],
  run_at: "document_idle"
}

const BUTTON_FLAG = "data-x-dist-btn"
// lucide send（纸飞机）图标
const SEND_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18.75" height="18.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>'

const GRAY = "rgb(113, 118, 123)"
const BLUE = "rgb(29, 155, 240)"

// 分发按钮：紧凑 trailing 按钮——不参与操作栏等宽拉伸，紧跟在分享图标旁
function createDistributeButton(): HTMLElement {
  const wrap = document.createElement("div")
  Object.assign(wrap.style, {
    display: "flex",
    flex: "0 1 auto",
    alignItems: "center",
    minWidth: "0"
  } as CSSStyleDeclaration)
  wrap.setAttribute(BUTTON_FLAG, "1")
  const btn = document.createElement("button")
  btn.type = "button"
  btn.setAttribute("aria-label", "分发到抖音/小红书/即刻")
  btn.title = "分发到抖音 / 小红书 / 即刻"
  btn.innerHTML = SEND_SVG
  // 用 CSSOM 直接赋样式（不经过 <style> 标签，不受页面 CSP 影响）
  Object.assign(btn.style, {
    appearance: "none",
    background: "transparent",
    border: "none",
    margin: "0",
    padding: "0 7px",
    height: "34px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: GRAY,
    cursor: "pointer",
    borderRadius: "9999px",
    transition: "color 0.2s, background-color 0.2s"
  })
  btn.addEventListener("mouseenter", () => {
    btn.style.color = BLUE
    btn.style.backgroundColor = "rgba(29, 155, 240, 0.1)"
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.color = GRAY
    btn.style.backgroundColor = "transparent"
  })
  btn.addEventListener("click", (e) => {
    e.stopPropagation()
    e.preventDefault()
    const article = btn.closest("article") as HTMLElement | null
    if (article) {
      bus.emit("open-panel", { article })
    }
  })
  wrap.appendChild(btn)
  return wrap
}

// 操作栏：以回复按钮为锚点定位其所在 role=group，避免误中其他分组
function findActionBar(article: HTMLElement): HTMLElement | null {
  const replyBtn = article.querySelector('button[data-testid="reply"]')
  const group = replyBtn?.closest('div[role="group"]') as HTMLElement | null
  if (group) return group
  const groups = article.querySelectorAll<HTMLElement>('div[role="group"]')
  return groups.length > 0 ? groups[groups.length - 1] : null
}

function scanAndInject() {
  const articles = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
  for (const article of articles) {
    const bar = findActionBar(article)
    if (!bar) continue
    if (bar.querySelector(`[${BUTTON_FLAG}]`)) continue
    bar.appendChild(createDistributeButton())
  }
}

// 悬浮窗挂载到 shadow DOM，样式与 x.com 页面完全隔离
function mountPanel() {
  if (document.getElementById("x-dist-panel-host")) return
  const host = document.createElement("div")
  host.id = "x-dist-panel-host"
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = cssText
  shadow.appendChild(style)
  const container = document.createElement("div")
  shadow.appendChild(container)
  createRoot(container).render(<DistributePanel />)
}

let scanTimer: ReturnType<typeof setTimeout> | undefined

function init() {
  mountPanel()
  scanAndInject()

  // x.com 时间线是虚拟列表，节点会被回收重建，需持续补挂图标
  const observer = new MutationObserver(() => {
    if (scanTimer) clearTimeout(scanTimer)
    scanTimer = setTimeout(scanAndInject, 300)
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

init()
