// HTML 渲染引擎：DOM + CSS 排版 → 自研 foreignObject 光栅化。
// 与 Canvas 引擎（./share-card.ts）同 API、同配置模型，可在配置弹窗中随时切换。
// 此引擎必须在「真实渲染器」环境运行（扩展渲染窗口 tabs/card-render.html）。
// 注：不用 html-to-image——其实测会把白色卡片层随机丢掉（样式克隆环节不稳定）；
// 自研路径 = 逐节点拷贝 computed style → SVG foreignObject → Image → canvas。
// 踩坑记录（2026-09，已修复）：测量容器是 visibility:hidden，computed style 会把
// 「不可见」一并拷进克隆，而 SVG 图像上下文里没有外层样式可覆盖它 → 整卡全透明。
// cloneWithComputedStyles 里必须把克隆强制改回 visibility:visible。
// 头像照片与自定义背景图不在 SVG 内嵌 <img>/url()，而是光栅化后直接绘制到
// canvas（与 Canvas 引擎同款画法：背景 cover → SVG 层 → 头像圆形裁剪），
// 既规避子资源加载时序问题，也保证两引擎视觉一致。
import type { TweetMediaItem } from "~extract/tweet"
import {
  type CardMediaBlock,
  type ShareCardInput,
  cardMediaSrc,
  fetchAvatarDataUrl,
  mediaBlocks,
  probeMediaSizes,
  MEDIA_GAP,
  MEDIA_RADIUS
} from "./share-card"
import {
  type CardConfig,
  backgroundCss,
  effectiveAuthorHandle,
  effectiveAuthorName,
  effectiveAvatarUrl,
  hexToRgba,
  shadowCss
} from "./config"

export type { ShareCardInput, CardPlan } from "./share-card"
import type { CardPlan } from "./share-card"

export const CARD_LABEL = "卡片"

// ---------- 布局常量（与 Canvas 引擎完全一致，保证两引擎排版相同） ----------
const BASE_W = 1920
const PAD_X = 96
const PAD_TOP = 88
const PAD_BOTTOM = 88
const AVATAR_D = 150
const NAME_FONT = 66
const HANDLE_FONT = 52
const HEADER_H = AVATAR_D
const GAP_HEADER = 64
const BODY_FONT = 72
const BODY_LH = 114
const META_FONT = 54
const META_GAP = 52
const METRICS_TOP_GAP = 44
const ICON_FONT = 54
const ICON_SIZE = 60
const ICON_ROW_H = 72
const PAGE_FONT = 44
const PAGE_PILL_H = 64

const FONT_FAMILY = `-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
const COLOR_TEXT = "#0f1419"
const COLOR_SUB = "#536471"
const COLOR_META_STRONG = "#3c4043"
const COLOR_PILL_BG = "#f2f4f5"
const COLOR_ACCENT = "#1d9bf0"

interface BodyMetrics {
  font: number
  lh: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function even(n: number): number {
  return Math.max(2, Math.ceil(n / 2) * 2)
}

function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`
}

// 等待一拍让布局生效（不用 rAF：渲染窗口可能最小化导致 rAF 节流）
function nextTick(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------- 互动数据行图标（lucide，ISC License） ----------
const ICON_PATHS: Record<string, string[]> = {
  reply: [
    "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
  ],
  retweet: ["m2 9 3-3 3 3", "M13 18H7a2 2 0 0 1-2-2V6", "m22 15-3 3-3-3", "M11 6h6a2 2 0 0 1 2 2v10"],
  heart: [
    "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
  ],
  bookmark: ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"],
  share: ["M12 3v12", "m17 8-5-5-5 5", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"]
}

function iconSvg(key: string, size: number, color: string): string {
  const paths = ICON_PATHS[key].map((d) => `<path d="${d}"/>`).join("")
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="display:block">${paths}</svg>`
}

function verifiedSvg(size: number): string {
  const r = size / 2
  const check = `M${r * 0.55} ${r}L${r * 0.9} ${r * 1.35}L${r * 1.48} ${r * 0.65}`
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;flex-shrink:0"><circle cx="${r}" cy="${r}" r="${r}" fill="${COLOR_ACCENT}"/><path d="${check}" stroke="#ffffff" stroke-width="${size * 0.11}" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`
}

// ---------- 隐藏容器与 DOM 文本测量 ----------
function createHiddenContainer(): HTMLDivElement {
  const el = document.createElement("div")
  el.setAttribute("data-x-dist-render", "1")
  el.style.cssText = "position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;"
  document.body.appendChild(el)
  return el
}

class DomTextMeasurer {
  private span: HTMLSpanElement
  constructor(container: HTMLElement, fontWeight: number, fontSize: number, scale: number) {
    this.span = document.createElement("span")
    this.span.style.cssText = [
      "position:absolute",
      "white-space:nowrap",
      "letter-spacing:normal",
      `font-family:${FONT_FAMILY}`,
      `font-weight:${fontWeight}`,
      `font-size:${px(fontSize * scale)}`,
      "text-transform:none"
    ].join(";")
    container.appendChild(this.span)
  }
  measure(text: string): number {
    this.span.textContent = text
    return this.span.getBoundingClientRect().width
  }
}

function wrapText(measurer: DomTextMeasurer, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("")
      continue
    }
    const tokens =
      paragraph.match(/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]|[^\s\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]+\s*|\s+/g) ??
      []
    let current = ""
    for (const token of tokens) {
      const candidate = current + token
      if (measurer.measure(candidate) <= maxWidth || current.trim() === "") {
        current = candidate
      } else {
        lines.push(current.trimEnd())
        current = token.trimStart()
      }
    }
    if (current) {
      lines.push(current.trimEnd())
    }
  }
  return lines
}


// ---------- 版面规划 ----------
// 各区块是否渲染（用户信息/互动数据逐项开关，见 config.header / config.metrics）
function headerVisible(config: CardConfig): boolean {
  return config.header.avatar || config.header.name || config.header.handle
}

function metricsGroups(config: CardConfig, input: ShareCardInput): [string, string][] {
  const groups: [string, string][] = []
  const m = config.metrics
  if (m.replies.show) groups.push(["reply", m.replies.value || input.stats.replies])
  if (m.retweets.show) groups.push(["retweet", m.retweets.value || input.stats.retweets])
  if (m.likes.show) groups.push(["heart", m.likes.value || input.stats.likes])
  if (m.bookmarks.show) groups.push(["bookmark", m.bookmarks.value || input.stats.bookmarks])
  if (m.share) groups.push(["share", ""])
  return groups
}

function metricsRowVisible(config: CardConfig, input: ShareCardInput): boolean {
  return config.showMetrics && metricsGroups(config, input).length > 0
}

// 展示值（自定义覆盖 > 推文真实数据）
function viewsText(config: CardConfig, input: ShareCardInput): string {
  return config.metrics.views.value || input.stats.views
}

function metaRowVisible(config: CardConfig, input: ShareCardInput): boolean {
  return Boolean(input.dateText) || (config.metrics.views.show && Boolean(viewsText(config, input)))
}

function headerBlockH(config: CardConfig): number {
  return headerVisible(config) ? HEADER_H + GAP_HEADER : 0
}

function footerHeightUnscaled(config: CardConfig, input: ShareCardInput): number {
  let h = 0
  if (metaRowVisible(config, input)) h += META_GAP + META_FONT * 1.2
  if (metricsRowVisible(config, input)) h += METRICS_TOP_GAP + ICON_ROW_H
  return h
}

function bodyMetrics(config: CardConfig): BodyMetrics {
  const scale = clamp(config.textScale || 1, 0.75, 1.5)
  return { font: BODY_FONT * scale, lh: BODY_LH * scale }
}

function resolveCanvas(config: CardConfig): { W: number; H: number; auto: boolean } {
  const parse = (v: string, fallback: number) => {
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : fallback
  }
  if (config.ratio === "custom") {
    return {
      W: even(clamp(parse(config.customW, BASE_W), 320, 2560)),
      H: even(clamp(parse(config.customH, 2560), 320, 6400)),
      auto: false
    }
  }
  if (config.ratio === "auto") {
    return { W: BASE_W, H: 0, auto: true }
  }
  const value: Record<string, number> = {
    // 值 = H/W（画布高 = 宽 × 该值）；横版 4:3/3:2/16:9 高度小于宽度
    "1:1": 1,
    "4:3": 3 / 4,
    "3:2": 2 / 3,
    "16:9": 9 / 16,
    "2:3": 3 / 2,
    "3:4": 4 / 3,
    "9:16": 16 / 9
  }
  return { W: BASE_W, H: even(BASE_W * (value[config.ratio] ?? 4 / 3)), auto: false }
}

// DOM 测量版本（与 Canvas 引擎分页逻辑一致，测量端改为真实 DOM）
export async function planCardDom(input: ShareCardInput, config: CardConfig): Promise<CardPlan> {
  const canvas = resolveCanvas(config)
  const s = canvas.W / BASE_W
  const body = bodyMetrics(config)

  const container = createHiddenContainer()
  try {
    const measurer = new DomTextMeasurer(container, 400, body.font, s)
    // 长度统一为基准 px × s：outerPadding 外边距 / paddingX 卡内左右边距
    const pad = config.outerPadding * s
    const innerW = canvas.W - 2 * pad - 2 * config.paddingX * s
    const allLines = wrapText(measurer, input.text, innerW)

    // 媒体块总高（按各自 aspect），末页展示；innerWUs = 未缩放内宽
    const mediaSizes = await probeMediaSizes(input, config)
    const blocks = mediaBlocks(input, config, mediaSizes)
    const innerWUs = innerW / s
    const mediaHUs =
      blocks.length > 0 ? MEDIA_GAP + blocks.reduce((acc, b) => acc + innerWUs * b.aspect + MEDIA_GAP, 0) : 0

    let H: number
    if (canvas.auto) {
      const contentH =
        (PAD_TOP +
          headerBlockH(config) +
          (headerVisible(config) ? body.lh * 0.42 : 0) +
          allLines.length * body.lh +
          mediaHUs +
          footerHeightUnscaled(config, input) +
          PAD_BOTTOM) *
        s
      // 自动比例：高度完全跟随内容 + 上下左右统一 outerPadding（不再垫高到正方形）
      H = even(clamp(contentH + 2 * pad, 0, canvas.W * (16 / 9)))
    } else {
      H = canvas.H
    }

    const capOf = (isLast: boolean) => {
      const availH = H - 2 * pad
      const chromeTop =
        (PAD_TOP + headerBlockH(config)) * s + (headerVisible(config) ? body.lh * s * 0.42 : 0)
      const fh = isLast
        ? footerHeightUnscaled(config, input) * s + mediaHUs * s
        : (PAGE_PILL_H + 14) * s
      return Math.max(1, Math.floor((availH - chromeTop - PAD_BOTTOM * s - fh) / (body.lh * s)))
    }

    const pageLineCounts: number[] = []
    let remaining = allLines.length
    while (remaining > 0) {
      const capLast = capOf(true)
      if (remaining <= capLast) {
        pageLineCounts.push(remaining)
        break
      }
      const take = Math.max(1, Math.min(capOf(false), remaining - 1))
      pageLineCounts.push(take)
      remaining -= take
    }

    const pages = pageLineCounts.length
    if (pages >= 2) {
      const target = Math.ceil(allLines.length / pages)
      const capMid = capOf(false)
      const capLast = capOf(true)
      if (target <= capMid) {
        const rebalanced: number[] = []
        let left = allLines.length
        for (let i = 0; i < pages; i++) {
          const cap = i === pages - 1 ? capLast : capMid
          const take = Math.min(target, cap, left)
          rebalanced.push(take)
          left -= take
        }
        if (left === 0) {
          pageLineCounts.length = 0
          pageLineCounts.push(...rebalanced)
        }
      }
    }

    const pageLines: string[][] = []
    let cursor = 0
    for (const count of pageLineCounts) {
      pageLines.push(allLines.slice(cursor, cursor + count))
      cursor += count
    }
    return { W: canvas.W, H, pages: pageLines, totalLines: allLines.length }
  } finally {
    container.remove()
  }
}

// ---------- 单页 DOM 构建 ----------
// avatarPhoto/bgOnCanvas：光栅化路径——头像照片与自定义背景图由光栅化阶段在
// canvas 上绘制，DOM 中只留透明占位（SVG 内出现图片子资源会导致整图空白，见文件头注释）
// avatarDataUrl：活 DOM 预览路径——直接嵌真实 <img>（挂载在弹窗里，不是 SVG 环境，无此限制）
interface DomLayers {
  avatarPhoto: boolean
  bgOnCanvas: boolean
  avatarDataUrl?: string | null
  live?: boolean // 活 DOM 预览：媒体直接嵌 <img>（光栅化路径图片在 canvas 上绘制）
  media?: CardMediaBlock[]
}

function buildCardPageNode(
  input: ShareCardInput,
  config: CardConfig,
  layers: DomLayers,
  lines: string[],
  pageIndex: number,
  totalPages: number,
  plan: CardPlan
): HTMLDivElement {
  const { W, H } = plan
  const s = W / BASE_W
  const body = bodyMetrics(config)
  const pad = config.outerPadding * s
  const cardX = pad
  const cardW = W - 2 * pad

  const isLast = pageIndex === totalPages - 1
  const innerW = cardW - config.paddingX * 2 * s
  const mediaList = layers.media ?? []
  const mediaH =
    isLast && mediaList.length > 0
      ? (MEDIA_GAP + mediaList.reduce((acc, b) => acc + (innerW / s) * b.aspect + MEDIA_GAP, 0)) * s
      : 0
  const contentH =
    (PAD_TOP +
      headerBlockH(config) +
      (headerVisible(config) ? body.lh * 0.42 : 0) +
      lines.length * body.lh +
      (isLast ? mediaH / s : 0) +
      footerHeightUnscaled(config, input) +
      PAD_BOTTOM) *
    s
  const availH = H - 2 * pad
  const cardH = Math.min(contentH, availH)
  const cardY =
    config.align === "top" ? pad : config.align === "bottom" ? H - pad - cardH : (H - cardH) / 2

  const hasBg = config.bgType !== "none"
  const cssBg = layers.bgOnCanvas ? null : backgroundCss(config)
  const root = document.createElement("div")
  root.style.cssText = [
    `width:${W}px`,
    `height:${H}px`,
    "position:relative",
    "overflow:hidden",
    `font-family:${FONT_FAMILY}`,
    cssBg ? `background:${cssBg}` : "background:transparent"
  ].join(";")

  // 水印层（透明背景不渲染）
  const wm = config.watermark
  if (hasBg && wm.enabled && wm.text.trim()) {
    const n = clamp(Math.round(wm.density), 2, 10)
    const layer = document.createElement("div")
    layer.style.cssText = `position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:${clamp(wm.opacity, 0, 0.75)}`
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = document.createElement("div")
        const cw = W / n
        const ch = H / n
        cell.style.cssText = [
          "position:absolute",
          `left:${px(c * cw)}`,
          `top:${px(r * ch)}`,
          `width:${px(cw)}`,
          `height:${px(ch)}`,
          "display:flex",
          "align-items:center",
          "justify-content:center",
          `transform:rotate(${wm.rotation}deg)`,
          `color:${wm.color}`,
          `font-size:${px(wm.fontSize * s)}`,
          "white-space:nowrap"
        ].join(";")
        cell.textContent = wm.text
        layer.appendChild(cell)
      }
    }
    root.appendChild(layer)
  }

  // 白色圆角卡（尺寸均为基准 px × s）
  const cardShortEdge = Math.min(cardW, cardH)
  const radius = clamp(config.cornerRadius * s, 0, cardShortEdge / 2)
  const shadows: string[] = []
  if (config.borderEnabled && config.borderThickness > 0 && config.borderOpacity > 0.0001) {
    shadows.push(
      `0 0 0 ${px(config.borderThickness * s)} ${hexToRgba(config.borderColor, config.borderOpacity)}`
    )
  }
  const shadow = shadowCss(config.shadow, config.shadowStyle, cardShortEdge)
  if (shadow) {
    shadows.push(shadow)
  }
  const card = document.createElement("div")
  // 标记卡片元素：活 DOM 预览用它做位置过渡动画（FLIP）
  card.dataset.xDistCard = "1"
  card.style.cssText = [
    "position:absolute",
    `top:${px(cardY)}`,
    `left:${px(cardX)}`,
    `width:${px(cardW)}`,
    `height:${px(cardH)}`,
    "background:#ffffff",
    `border-radius:${px(radius)}`,
    shadows.length > 0 ? `box-shadow:${shadows.join(", ")}` : "",
    // 卡内全部走文档流自动布局：flex 纵向 + 间距交给 margin，不再手写绝对坐标
    "display:flex",
    "flex-direction:column",
    "box-sizing:border-box",
    `padding:${px(PAD_TOP * s)} ${px(config.paddingX * s)} ${px(PAD_BOTTOM * s)}`
  ].join(";")
  root.appendChild(card)

  // ---- 头部（流式布局第一行；头像/名称/ID 逐项显隐） ----
  const hcfg = config.header
  if (hcfg.avatar || hcfg.name || hcfg.handle) {
    const header = document.createElement("div")
    header.style.cssText = [
      "display:flex",
      "align-items:center",
      `gap:${px(44 * s)}`,
      `height:${px(HEADER_H * s)}`,
      "flex-shrink:0"
    ].join(";")
    card.appendChild(header)

    let avatarEl: HTMLElement | null = null
    if (hcfg.avatar) {
      if (layers.avatarDataUrl) {
        // 活 DOM 预览：直接嵌真实头像图（不进 SVG，无子资源限制）
        const img = document.createElement("img")
        img.src = layers.avatarDataUrl
        img.alt = ""
        avatarEl = img
      } else if (layers.avatarPhoto) {
        // 照片由光栅化阶段绘制，SVG 内只留透明占位；实际位置渲染前用 DOM 实测
        avatarEl = document.createElement("div")
        avatarEl.dataset.xDistAvatar = "1"
      } else {
        avatarEl = document.createElement("div")
        avatarEl.textContent = (effectiveAuthorName(input, config) || "X")[0]?.toUpperCase() ?? "X"
        avatarEl.style.cssText = `display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:600;font-size:${px(76 * s)};background:${COLOR_ACCENT}`
      }
      avatarEl.style.cssText = [
        `width:${px(AVATAR_D * s)}`,
        `height:${px(AVATAR_D * s)}`,
        "border-radius:50%",
        "object-fit:cover",
        "flex-shrink:0",
        avatarEl.style.cssText
      ].join(";")
      header.appendChild(avatarEl)
    }

    const nameBlock = document.createElement("div")
    nameBlock.style.cssText = "display:flex;flex-direction:column;min-width:0;flex:1"
    if (hcfg.name) {
      const nameRow = document.createElement("div")
      nameRow.style.cssText = `display:flex;align-items:center;gap:${px(24 * s)};max-width:100%`
      const nameSpan = document.createElement("span")
      nameSpan.textContent = effectiveAuthorName(input, config) || "X 用户"
      // min-width:0 + 溢出省略（flex 子项默认 min-width:auto 会被硬裁）；
      // data-x-dist-fit: 挂载后自适应缩字号（fitHeaderText）
      nameSpan.dataset.xDistFit = String(NAME_FONT * s)
      nameSpan.style.cssText = [
        `font-size:${px(NAME_FONT * s)}`,
        "font-weight:700",
        `color:${COLOR_TEXT}`,
        "min-width:0",
        "flex:0 1 auto",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap"
      ].join(";")
      nameRow.appendChild(nameSpan)
      if (input.verified) {
        const badge = document.createElement("span")
        badge.innerHTML = verifiedSvg(40 * s)
        nameRow.appendChild(badge)
      }
      nameBlock.appendChild(nameRow)
    }
    if (hcfg.handle) {
      const handleSpan = document.createElement("span")
      handleSpan.textContent = effectiveAuthorHandle(input, config)
      handleSpan.dataset.xDistFit = String(HANDLE_FONT * s)
      handleSpan.style.cssText = [
        `font-size:${px(HANDLE_FONT * s)}`,
        `color:${COLOR_SUB}`,
        "min-width:0",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap"
      ].join(";")
      nameBlock.appendChild(handleSpan)
    }
    header.appendChild(nameBlock)
  }

  // ---- 正文 ----
  // 与头部的间距 = 组间距 + 0.42 行高（复刻 Canvas 引擎的视觉节奏，非整数行才需要）
  const bodyEl = document.createElement("div")
  bodyEl.style.cssText = [
    // 头部隐藏时正文直接从上内边距开始；0.42 行高是首行视觉居中的补偿
    `margin-top:${px((headerVisible(config) ? GAP_HEADER + body.lh * 0.42 : 0) * s)}`,
    `font-size:${px(body.font * s)}`,
    `line-height:${px(body.lh * s)}`,
    `color:${COLOR_TEXT}`,
    "word-break:break-word",
    "overflow:hidden"
  ].join(";")
  for (const line of lines) {
    const lineEl = document.createElement("div")
    if (line) {
      lineEl.textContent = line
    } else {
      lineEl.style.height = px(body.lh * s)
    }
    bodyEl.appendChild(lineEl)
  }
  card.appendChild(bodyEl)

  // ---- 媒体（末页正文之后；16:9 cover + 圆角，视频叠播放按钮） ----
  if (isLast && mediaList.length > 0) {
    const mediaWrap = document.createElement("div")
    mediaWrap.style.cssText = [
      `margin-top:${px(MEDIA_GAP * s)}`,
      "display:flex",
      "flex-direction:column",
      `gap:${px(MEDIA_GAP * s)}`,
      "flex-shrink:0"
    ].join(";")
    mediaList.forEach((b, i) => {
      const mh = innerW * b.aspect
      const cell = document.createElement("div")
      cell.style.cssText = [
        "position:relative",
        `height:${px(mh)}`,
        `border-radius:${px(MEDIA_RADIUS * s)}`,
        "overflow:hidden",
        "background:#e9edf0",
        "flex-shrink:0"
      ].join(";")
      if (layers.live) {
        // 活 DOM 预览：直接嵌远程图（页面上下文可加载）
        const img = document.createElement("img")
        img.src = cardMediaSrc(b.source)
        img.alt = ""
        img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block"
        cell.appendChild(img)
        if (b.source.kind === "video") {
          const badge = document.createElement("div")
          badge.style.cssText = [
            "position:absolute",
            `left:${px(innerW / 2 - Math.min(innerW, mh) * 0.11)}px`,
            `top:${px(mh / 2 - Math.min(innerW, mh) * 0.11)}px`,
            `width:${px(Math.min(innerW, mh) * 0.22)}px`,
            `height:${px(Math.min(innerW, mh) * 0.22)}px`,
            "border-radius:50%",
            "background:rgba(0,0,0,0.45)",
            "display:flex",
            "align-items:center",
            "justify-content:center"
          ].join(";")
          const tri = document.createElement("div")
          tri.style.cssText = `width:0;height:0;border-left:${px(Math.min(innerW, mh) * 0.05)}px solid #ffffff;border-top:${px(Math.min(innerW, mh) * 0.038)}px solid transparent;border-bottom:${px(Math.min(innerW, mh) * 0.038)}px solid transparent;margin-left:${px(Math.min(innerW, mh) * 0.012)}px`
          badge.appendChild(tri)
          cell.appendChild(badge)
        }
      } else {
        // 光栅化路径：透明占位，图片由光栅化阶段在 canvas 上绘制
        cell.dataset.xDistMedia = String(i)
        cell.dataset.xDistMediaVideo = b.source.kind === "video" ? "1" : ""
      }
      mediaWrap.appendChild(cell)
    })
    card.appendChild(mediaWrap)
  }

  // ---- 页脚 ----
  // 末页：日期行 margin-top:auto 沉底，数据行用固定间距跟随；页码是卡内唯一的
  // 绝对定位元素（相对卡片底边，无叠加基准问题）。非末页：页码胶囊居中沉底。
  if (isLast) {
    if (metaRowVisible(config, input)) {
      const meta = document.createElement("div")
      meta.style.cssText = [
        "margin-top:auto",
        `font-size:${px(META_FONT * s)}`,
        "line-height:1.2",
        "display:flex",
        "align-items:baseline",
        `gap:${px(2 * s)}`
      ].join(";")
      const segments: { text: string; color: string; weight: number }[] = []
      if (input.dateText) {
        segments.push({ text: input.dateText, color: COLOR_SUB, weight: 400 })
      }
      const views = viewsText(config, input)
      if (config.metrics.views.show && views) {
        if (segments.length > 0) {
          segments.push({ text: "·", color: COLOR_SUB, weight: 400 })
        }
        segments.push({ text: views, color: COLOR_META_STRONG, weight: 600 })
        segments.push({ text: "次浏览", color: COLOR_SUB, weight: 400 })
      }
      for (const seg of segments) {
        const span = document.createElement("span")
        span.textContent = seg.text
        span.style.cssText = `color:${seg.color};font-weight:${seg.weight};margin-right:${px(10 * s)}`
        meta.appendChild(span)
      }
      card.appendChild(meta)
    }

    const groups = metricsRowVisible(config, input) ? metricsGroups(config, input) : []
    if (groups.length > 0) {
      const row = document.createElement("div")
      row.style.cssText = [
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        `margin-top:${px(METRICS_TOP_GAP * s)}`,
        `height:${px(ICON_ROW_H * s)}`,
        "flex-shrink:0"
      ].join(";")
      for (const [key, count] of groups) {
        const group = document.createElement("div")
        group.style.cssText = `display:flex;align-items:center;gap:${px(18 * s)}`
        group.innerHTML = iconSvg(key, ICON_SIZE * s, COLOR_SUB)
        if (count) {
          const num = document.createElement("span")
          num.textContent = count
          num.style.cssText = `font-size:${px(ICON_FONT * s)};color:${COLOR_SUB}`
          group.appendChild(num)
        }
        row.appendChild(group)
      }
      card.appendChild(row)
    }

    if (totalPages > 1) {
      const page = document.createElement("div")
      page.textContent = `${pageIndex + 1} / ${totalPages}`
      page.style.cssText = [
        "position:absolute",
        `bottom:${px(PAD_BOTTOM * s)}`,
        `right:${px(config.paddingX * s)}`,
        `font-size:${px(PAGE_FONT * s)}`,
        `color:${COLOR_SUB}`
      ].join(";")
      card.appendChild(page)
    }
  } else if (totalPages > 1) {
    const pill = document.createElement("div")
    pill.textContent = `${pageIndex + 1} / ${totalPages}`
    pill.style.cssText = [
      "margin-top:auto",
      "align-self:center",
      `height:${px(PAGE_PILL_H * s)}`,
      `padding:0 ${px(28 * s)}`,
      "display:flex",
      "align-items:center",
      `border-radius:${px(PAGE_PILL_H * s)}`,
      `background:${COLOR_PILL_BG}`,
      `font-size:${px(PAGE_FONT * s)}`,
      `color:${COLOR_SUB}`
    ].join(";")
    card.appendChild(pill)
  }

  return root
}

// ---------- 自研光栅化：computed style 克隆 → SVG foreignObject → canvas ----------
// SVG 内只含文字与形状；头像照片与自定义背景图（图片子资源，见文件头注释）
// 作为独立图层在 canvas 上直接绘制。头像的落点不手算，渲染前实测占位元素位置
interface AvatarGeom {
  cx: number
  cy: number
  r: number
}

interface MediaEntry {
  img: HTMLImageElement | null
  rect: { x: number; y: number; w: number; h: number }
  video: boolean
}

interface RasterLayers {
  avatarImg?: HTMLImageElement | null
  bgImg?: HTMLImageElement | null
  avatarGeom?: AvatarGeom | null
  mediaEntries?: MediaEntry[]
}

// 名称/ID 自适应缩字：过长时先逐级缩小字号（最小 0.62 倍），仍放不下交由 CSS 省略号。
// 需节点已挂载（scrollWidth/clientWidth 触发真实布局）
function fitHeaderText(root: HTMLElement) {
  const els = root.querySelectorAll<HTMLElement>("[data-x-dist-fit]")
  for (const el of els) {
    const base = Number.parseFloat(el.dataset.xDistFit || "0")
    if (!Number.isFinite(base) || base <= 0) continue
    el.style.fontSize = `${base}px`
    let size = base
    const step = Math.max(1, Math.round(base * 0.04))
    while (el.scrollWidth > el.clientWidth && size > base * 0.62) {
      size -= step
      el.style.fontSize = `${size}px`
    }
  }
}

// 卡片根节点坐标系下的头像圆形位置（getBoundingClientRect 不受 visibility 影响）
function measureAvatarGeom(node: HTMLElement): AvatarGeom | null {
  const el = node.querySelector("[data-x-dist-avatar]")
  if (!(el instanceof HTMLElement)) {
    return null
  }
  const er = el.getBoundingClientRect()
  const nr = node.getBoundingClientRect()
  if (er.width <= 0 || er.height <= 0) {
    return null
  }
  return {
    cx: er.left - nr.left + er.width / 2,
    cy: er.top - nr.top + er.height / 2,
    r: Math.min(er.width, er.height) / 2
  }
}

// 光栅化路径：实测媒体占位元素在根坐标系下的矩形
function measureMediaEntries(node: HTMLElement, blocks: CardMediaBlock[]): MediaEntry[] {
  const nr = node.getBoundingClientRect()
  return blocks.map((b, i) => {
    const el = node.querySelector(`[data-x-dist-media="${i}"]`)
    const rect = { x: 0, y: 0, w: 0, h: 0 }
    if (el instanceof HTMLElement) {
      const er = el.getBoundingClientRect()
      rect.x = er.left - nr.left
      rect.y = er.top - nr.top
      rect.w = er.width
      rect.h = er.height
    }
    return { img: null, rect, video: b.source.kind === "video" }
  })
}

function cloneWithComputedStyles(source: Element, target: Element) {
  if (source instanceof HTMLElement && target instanceof HTMLElement) {
    const computed = getComputedStyle(source)
    for (let i = 0; i < computed.length; i++) {
      const prop = computed.item(i)
      const value = computed.getPropertyValue(prop)
      if (value) {
        target.style.setProperty(prop, value, computed.getPropertyPriority(prop))
      }
    }
    // 测量容器是 visibility:hidden，computed 会把「不可见」也拷进克隆——
    // SVG 图像上下文里没有外层样式可以覆盖它，整卡会渲染成全透明。必须显式改回可见
    target.style.setProperty("visibility", "visible")
  }
  const sChildren = source.children
  const tChildren = target.children
  for (let i = 0; i < sChildren.length; i++) {
    cloneWithComputedStyles(sChildren[i], tChildren[i])
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => reject(new Error("图片加载超时")), 8000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error("图片加载失败"))
    }
    img.src = src
  })
}

// 与 Canvas 引擎同款：cover 铺满
function drawBackgroundCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const scale = Math.max(W / img.width, H / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

// 与 Canvas 引擎同款：圆形裁剪 + cover 绘制头像
function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  const scale = Math.max((r * 2) / img.width, (r * 2) / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  ctx.restore()
}

async function rasterizeNode(
  node: HTMLElement,
  W: number,
  H: number,
  layers: RasterLayers = {}
): Promise<string> {
  const clone = node.cloneNode(true) as HTMLElement
  cloneWithComputedStyles(node, clone)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<foreignObject width="100%" height="100%">` +
    new XMLSerializer().serializeToString(clone) +
    `</foreignObject></svg>`
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const img = await loadImageElement(url)
  // SVG 的 onload 可能早于内容完成光栅化，decode + 宽限等待后再上 canvas
  try {
    await img.decode()
  } catch {
    // 某些环境 decode 不可用，退回宽限等待
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  if (layers.bgImg) {
    drawBackgroundCover(ctx, layers.bgImg, W, H)
  }
  ctx.drawImage(img, 0, 0, W, H)
  if (layers.avatarImg && layers.avatarGeom) {
    const geom = layers.avatarGeom
    if (Number.isFinite(geom.cx) && Number.isFinite(geom.cy) && geom.r > 0) {
      drawAvatarCircle(ctx, layers.avatarImg, geom.cx, geom.cy, geom.r)
    }
  }
  // 媒体块（图片 cover 裁切 + 圆角，视频叠播放按钮）
  for (const entry of layers.mediaEntries ?? []) {
    const { x, y, w, h } = entry.rect
    if (w <= 0 || h <= 0) continue
    ctx.save()
    ctx.beginPath()
    ctx.roundRect?.(x, y, w, h, Math.min(MEDIA_RADIUS * (w / 1500), h / 2))
    if (!ctx.roundRect) {
      ctx.rect(x, y, w, h)
    }
    ctx.closePath()
    ctx.clip()
    if (entry.img) {
      const scale = Math.max(w / entry.img.width, h / entry.img.height)
      const dw = entry.img.width * scale
      const dh = entry.img.height * scale
      ctx.drawImage(entry.img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    } else {
      ctx.fillStyle = "#e9edf0"
      ctx.fillRect(x, y, w, h)
    }
    ctx.restore()
    if (entry.video) {
      const cx = x + w / 2
      const cy = y + h / 2
      const br = Math.min(w, h) * 0.11
      ctx.fillStyle = "rgba(0,0,0,0.45)"
      ctx.beginPath()
      ctx.arc(cx, cy, br, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      const tw = br * 0.9
      ctx.beginPath()
      ctx.moveTo(cx - tw * 0.35, cy - tw / 2)
      ctx.lineTo(cx - tw * 0.35, cy + tw / 2)
      ctx.lineTo(cx + tw * 0.55, cy)
      ctx.closePath()
      ctx.fill()
    }
  }
  return canvas.toDataURL("image/png")
}

// 预加载图片图层：头像（dataUrl，经 background 抓取）与自定义背景
async function prepareRasterLayers(
  input: ShareCardInput,
  config: CardConfig
): Promise<{
  avatarImg: HTMLImageElement | null
  bgImg: HTMLImageElement | null
  blocks: CardMediaBlock[]
  mediaImgs: (HTMLImageElement | null)[]
}> {
  let avatarImg: HTMLImageElement | null = null
  const avatarUrl = effectiveAvatarUrl(input, config)
  if (avatarUrl) {
    try {
      const dataUrl = await fetchAvatarDataUrl(avatarUrl)
      if (dataUrl) {
        avatarImg = await loadImageElement(dataUrl)
      }
    } catch {
      avatarImg = null
    }
  }
  let bgImg: HTMLImageElement | null = null
  if (config.bgType === "custom" && config.bgCustomDataUrl) {
    try {
      bgImg = await loadImageElement(config.bgCustomDataUrl)
    } catch {
      bgImg = null
    }
  }
  // 卡片媒体图片（含原比例尺寸探测，探测结果有缓存）
  const mediaSizes = await probeMediaSizes(input, config)
  const blocks = mediaBlocks(input, config, mediaSizes)
  const mediaImgs = await Promise.all(
    blocks.map(async (b) => {
      try {
        const dataUrl = await fetchAvatarDataUrl(cardMediaSrc(b.source))
        return dataUrl ? await loadImageElement(dataUrl) : null
      } catch {
        return null
      }
    })
  )
  return { avatarImg, bgImg, blocks, mediaImgs }
}

export async function generateShareCardsDom(
  input: ShareCardInput,
  config: CardConfig
): Promise<TweetMediaItem[]> {
  const plan = await planCardDom(input, config)
  const { avatarImg, bgImg, blocks, mediaImgs } = await prepareRasterLayers(input, config)
  const domLayers: DomLayers = { avatarPhoto: !!avatarImg, bgOnCanvas: !!bgImg, media: blocks }

  const container = createHiddenContainer()
  try {
    const items: TweetMediaItem[] = []
    for (let p = 0; p < plan.pages.length; p++) {
      const node = buildCardPageNode(input, config, domLayers, plan.pages[p], p, plan.pages.length, plan)
      container.appendChild(node)
      fitHeaderText(node)
      await nextTick()
      const dataUrl = await rasterizeNode(node, plan.W, plan.H, {
        avatarImg,
        bgImg,
        avatarGeom: measureAvatarGeom(node),
        mediaEntries: measureMediaEntries(node, blocks).map((e, i) => ({ ...e, img: mediaImgs[i] ?? null }))
      })
      node.remove()
      items.push({
        kind: "image",
        url: dataUrl,
        thumbUrl: dataUrl,
        name: `tweet-card-${p + 1}.png`,
        type: "image/png",
        label: CARD_LABEL
      })
    }
    return items
  } finally {
    container.remove()
  }
}

export async function renderCardPreviewDom(
  input: ShareCardInput,
  config: CardConfig,
  plan: CardPlan,
  pageIndex: number
): Promise<string> {
  const { avatarImg, bgImg, blocks, mediaImgs } = await prepareRasterLayers(input, config)
  const domLayers: DomLayers = { avatarPhoto: !!avatarImg, bgOnCanvas: !!bgImg, media: blocks }
  const container = createHiddenContainer()
  try {
    const page = Math.min(Math.max(0, pageIndex), plan.pages.length - 1)
    const node = buildCardPageNode(input, config, domLayers, plan.pages[page] ?? [], page, plan.pages.length, plan)
    container.appendChild(node)
    fitHeaderText(node)
    await nextTick()
    return await rasterizeNode(node, plan.W, plan.H, {
      avatarImg,
      bgImg,
      avatarGeom: measureAvatarGeom(node),
      mediaEntries: measureMediaEntries(node, blocks).map((e, i) => ({ ...e, img: mediaImgs[i] ?? null }))
    })
  } finally {
    container.remove()
  }
}

// ---------- 活 DOM 预览（配置弹窗直接挂载，不出图、零光栅化开销） ----------
// 改配置时每次重建只需文本测量 + 建 ~50 个节点，拖动滑杆也不卡；
// 点「确定」后才走 generateShareCardsDom/renderCardPreviewDom 出真图
export async function buildLivePreviewNode(
  input: ShareCardInput,
  config: CardConfig,
  pageIndex: number
): Promise<{ node: HTMLDivElement; plan: CardPlan }> {
  const plan = await planCardDom(input, config)
  const page = Math.min(Math.max(0, pageIndex), plan.pages.length - 1)
  let avatarDataUrl: string | null = null
  const avatarUrl = effectiveAvatarUrl(input, config)
  if (avatarUrl) {
    try {
      avatarDataUrl = await fetchAvatarDataUrl(avatarUrl)
    } catch {
      avatarDataUrl = null
    }
  }
  const node = buildCardPageNode(
    input,
    config,
    { avatarPhoto: false, bgOnCanvas: false, avatarDataUrl, live: true, media: mediaBlocks(input, config, await probeMediaSizes(input, config)) },
    plan.pages[page] ?? [],
    page,
    plan.pages.length,
    plan
  )
  // 短暂挂到隐藏容器里做名称/ID 缩字测量，测完即摘下交还给弹窗挂载
  const container = createHiddenContainer()
  try {
    container.appendChild(node)
    fitHeaderText(node)
    node.remove()
  } finally {
    container.remove()
  }
  return { node, plan }
}
