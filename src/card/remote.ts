// HTML 引擎的内容脚本入口：经 background 转发到扩展渲染窗口执行
// （渲染窗口 = 真实渲染器环境，规避页面 CSP 与 offscreen 无渲染管线的问题）
import type { CardConfig } from "./config"
import type { ShareCardInput } from "./share-card"
import type { TweetMediaItem } from "~extract/tweet"

export interface CardPlanMeta {
  W: number
  H: number
  totalPages: number
}

export interface HtmlRenderResponse {
  ok: boolean
  error?: string
  items?: TweetMediaItem[]
  dataUrl?: string
  plan?: CardPlanMeta
}

export function renderHtmlCards(
  input: ShareCardInput,
  config: CardConfig,
  page?: number
): Promise<HtmlRenderResponse> {
  const timeoutMs = typeof page === "number" ? 20000 : 60000
  const send = chrome.runtime.sendMessage({
    action: "X_DIST_RENDER_CARDS",
    engine: "html",
    input,
    config,
    page
  })
  return Promise.race([
    send as Promise<HtmlRenderResponse>,
    new Promise<HtmlRenderResponse>((_, reject) =>
      setTimeout(() => reject(new Error(`HTML 渲染超时（${timeoutMs / 1000}s）`)), timeoutMs)
    )
  ]).catch((e) => ({ ok: false, error: String(e) })) as Promise<HtmlRenderResponse>
}
