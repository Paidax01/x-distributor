import { generateShareCardsDom, planCardDom, renderCardPreviewDom } from "~card/share-card-dom"
import type { CardConfig } from "~card/config"
import type { ShareCardInput } from "~card/share-card"

// HTML 渲染引擎执行页：加载在扩展自己的渲染窗口里（真实渲染器环境）。
// 不在 x.com 页面内跑（CSP 限制），也不在 offscreen document 里跑（无渲染管线会挂起）。
export default function CardRender() {
  return (
    <div style={{ fontFamily: "-apple-system, sans-serif", fontSize: 11, color: "#888", padding: 8 }}>
      卡片渲染引擎（HTML 模式）· 请勿关闭本窗口
    </div>
  )
}

// 自校验：确认输出的 dataUrl 是可解码、尺寸正确的图片
async function verifyDataUrl(dataUrl: string, expectW: number, expectH: number): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) {
    return `输出不是合法的 PNG data URL（前缀：${dataUrl?.slice(0, 30) || "空"}）`
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error("解码失败"))
      image.src = dataUrl
    })
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      return `解码后尺寸为 0`
    }
    if (img.naturalWidth < expectW * 0.5 || img.naturalHeight < expectH * 0.5) {
      return `尺寸异常：期望约 ${expectW}x${expectH}，实际 ${img.naturalWidth}x${img.naturalHeight}`
    }
    return null
  } catch (e) {
    return `图片解码失败：${String(e)}`
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action !== "X_DIST_HTML_RENDER") return false
  // 看门狗：任何环节卡住，15 秒内必定回包
  let responded = false
  const reply = (payload: unknown) => {
    if (responded) return
    responded = true
    try {
      sendResponse(payload)
    } catch {
      // 通道已断（窗口被关闭），忽略
    }
  }
  const watchdog = setTimeout(() => {
    reply({ ok: false, error: "HTML 渲染内部超时（15s）" })
  }, 15000)

  ;(async () => {
    try {
      const input = request.input as ShareCardInput
      const config = request.config as CardConfig
      const plan = await planCardDom(input, config)
      if (plan.pages.length === 0) {
        reply({ ok: false, error: "排版结果为空（正文为空或测量异常）" })
        return
      }
      if (typeof request.page === "number") {
        const page = Math.min(Math.max(0, request.page), plan.pages.length - 1)
        const dataUrl = await renderCardPreviewDom(input, config, plan, page)
        const problem = await verifyDataUrl(dataUrl, plan.W, plan.H)
        if (problem) {
          reply({ ok: false, error: `预览图校验失败：${problem}` })
          return
        }
        reply({
          ok: true,
          dataUrl,
          plan: { W: plan.W, H: plan.H, totalPages: plan.pages.length }
        })
      } else {
        const items = await generateShareCardsDom(input, config)
        if (!items || items.length === 0) {
          reply({ ok: false, error: "生成了 0 张卡片" })
          return
        }
        for (const item of items) {
          const problem = await verifyDataUrl(item.url, plan.W, plan.H)
          if (problem) {
            reply({ ok: false, error: `卡片校验失败（${item.name}）：${problem}` })
            return
          }
        }
        reply({
          ok: true,
          items,
          plan: { W: plan.W, H: plan.H, totalPages: plan.pages.length }
        })
      }
    } catch (e) {
      reply({ ok: false, error: String(e) })
    } finally {
      clearTimeout(watchdog)
    }
  })()
  return true
})
