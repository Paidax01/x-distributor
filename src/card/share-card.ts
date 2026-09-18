// 推文分享卡片生成器：原生 Canvas 2D 直绘（无第三方依赖）
// 在内容脚本里同步渲染，不经 offscreen/消息链路，不受页面 CSP 影响——
// 这是自始至终稳定可用的渲染方式；全部 CardConfig 配置项均支持。
// 互动数据行图标为 lucide（ISC）路径。
import type { TweetMediaItem, TweetStats } from "~extract/tweet"
import {
  type CardConfig,
  backgroundCss,
  effectiveAuthorHandle,
  effectiveAuthorName,
  effectiveAvatarUrl,
  GRADIENT_PRESETS,
  hexToRgba,
  shadowCss,
  SOLID_PRESETS
} from "./config"

export const CARD_LABEL = "卡片"

export interface ShareCardInput {
  authorName: string
  authorHandle: string // 含 @ 前缀
  avatarUrl: string | null
  verified: boolean
  text: string
  dateText: string
  stats: TweetStats
  media?: CardMediaSource[] // 推文图片 / 视频封面
}

// 卡片内展示的媒体源（图片用原图，视频用封面帧）
export interface CardMediaSource {
  kind: "image" | "video"
  url: string
  thumbUrl: string
}

// 媒体布局常量（双引擎共用数值）：16:9 块、间距、圆角
export const MEDIA_ASPECT = 9 / 16
export const MEDIA_GAP = 40
export const MEDIA_RADIUS = 16

// 参与渲染的媒体列表（按 hiddenUrls 过滤）
export function cardMediaList(input: ShareCardInput, config: CardConfig): CardMediaSource[] {
  if (!config.media.show || !input.media) return []
  return input.media.filter((m) => !config.media.hiddenUrls.includes(m.url))
}

// 媒体展示地址（视频取封面帧）
export function cardMediaSrc(m: CardMediaSource): string {
  return m.kind === "video" ? m.thumbUrl : m.url
}

// 渲染用媒体块：aspect = 高/宽。固定模式统一 16:9，原比例模式取图片真实宽高
export interface CardMediaBlock {
  source: CardMediaSource
  aspect: number
}

export interface MediaSize {
  w: number
  h: number
}

// 原比例模式需探测真实尺寸；按展示地址缓存，探测一次后所有预览重建零开销
const mediaSizeCache = new Map<string, MediaSize>()

export async function probeMediaSizes(
  input: ShareCardInput,
  config: CardConfig
): Promise<(MediaSize | null)[]> {
  const list = cardMediaList(input, config)
  if (config.media.aspect !== "original" || list.length === 0) {
    return list.map(() => null)
  }
  return Promise.all(
    list.map(async (m) => {
      const src = cardMediaSrc(m)
      const cached = mediaSizeCache.get(src)
      if (cached) return cached
      try {
        const dataUrl = await fetchAvatarDataUrl(src)
        if (!dataUrl) return null
        const img = await loadImageCached(`mediaprobe:${src}`, dataUrl)
        if (!img) return null
        const size = { w: img.naturalWidth, h: img.naturalHeight }
        mediaSizeCache.set(src, size)
        return size
      } catch {
        return null
      }
    })
  )
}

// 计算渲染块：sizes 缺失或探测失败时退回 16:9。
// 原比例做合理钳制 [0.4, 2.0]（cover 裁切展示）：极端全景/长条图不至于撑爆卡片
export const MEDIA_ASPECT_MIN = 0.4
export const MEDIA_ASPECT_MAX = 2.0

export function mediaBlocks(
  input: ShareCardInput,
  config: CardConfig,
  sizes?: (MediaSize | null)[]
): CardMediaBlock[] {
  const list = cardMediaList(input, config)
  return list.map((m, i) => ({
    source: m,
    aspect:
      config.media.aspect === "original" && sizes?.[i] && sizes[i]!.w > 0
        ? Math.min(MEDIA_ASPECT_MAX, Math.max(MEDIA_ASPECT_MIN, sizes[i]!.h / sizes[i]!.w))
        : MEDIA_ASPECT
  }))
}

// ---------- 布局常量（以 1920 宽画布为基准，按 s = W/1920 缩放） ----------
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
const BODY_LH = 114 // 行高比 ≈ 1.58
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

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_FAMILY}`
}

// ---------- 互动数据行图标（lucide-static 0.544.0，ISC License） ----------
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

function drawLucideIcon(
  ctx: CanvasRenderingContext2D,
  paths: string[],
  x: number,
  y: number,
  size: number,
  color: string
) {
  const scale = size / 24
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.1
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  for (const d of paths) {
    ctx.stroke(new Path2D(d))
  }
  ctx.restore()
}

// ---------- 资源缓存（头像 / 自定义背景 → dataUrl Image） ----------
const imageCache = new Map<string, HTMLImageElement>()

function loadImageCached(key: string, src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(key)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      imageCache.set(key, img)
      resolve(img)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// 经 background 代抓头像（service worker 持有 host_permissions，无 CORS 限制）。
// data: URL（自定义上传头像）无需代抓，直接返回
export async function fetchAvatarDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) {
    return url
  }
  try {
    const res = await chrome.runtime.sendMessage({ action: "X_DIST_FETCH_IMAGE_DATA", url })
    if (res?.ok && typeof res.dataUrl === "string") {
      return res.dataUrl
    }
  } catch {
    // 忽略，走占位头像
  }
  return null
}

// ---------- 文本换行（CJK 逐字、拉丁按词） ----------
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
      if (ctx.measureText(candidate).width <= maxWidth || current.trim() === "") {
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
// 各区块是否渲染（用户信息/互动数据逐项开关，见 config.header / config.metrics）。
// 与 DOM 引擎（share-card-dom.ts）保持完全一致的实现
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

export interface CardPlan {
  W: number
  H: number
  pages: string[][]
  totalLines: number
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

function measureCtx(body: BodyMetrics): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas")
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext("2d")!
  ctx.font = font(400, body.font)
  return ctx
}

export function planCard(
  input: ShareCardInput,
  config: CardConfig,
  mediaSizes?: (MediaSize | null)[]
): CardPlan {
  const canvas = resolveCanvas(config)
  const s = canvas.W / BASE_W
  const body = bodyMetrics(config)

  const measurer = measureCtx(body)
  // 长度统一为基准 px × s：outerPadding 外边距 / paddingX 卡内左右边距
  const pad = config.outerPadding * s
  const innerW = canvas.W - 2 * pad - 2 * config.paddingX * s
  const allLines = wrapText(measurer, input.text, innerW)

  // 媒体块总高（按各自 aspect），末页展示；innerWUs = 未缩放内宽
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

  // 重排为均匀分布（避免末页只剩一两行）
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
}

// ---------- 绘制 ----------
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: CardConfig,
  customBgImg: HTMLImageElement | null
) {
  if (config.bgType === "none") return
  if (config.bgType === "custom" && customBgImg) {
    const scale = Math.max(W / customBgImg.width, H / customBgImg.height)
    const dw = customBgImg.width * scale
    const dh = customBgImg.height * scale
    ctx.drawImage(customBgImg, (W - dw) / 2, (H - dh) / 2, dw, dh)
    return
  }
  if (config.bgType === "solid") {
    const preset = SOLID_PRESETS.find((p) => p.id === config.bgSolidId) ?? SOLID_PRESETS[0]
    ctx.fillStyle = preset.css
    ctx.fillRect(0, 0, W, H)
    return
  }
  const preset = GRADIENT_PRESETS.find((p) => p.id === config.bgGradientId) ?? GRADIENT_PRESETS[0]
  // CSS 角度 → 画布起止点：方向向量 (sinθ, -cosθ)，过画布中心取最长投影
  const rad = (preset.deg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const halfLen = (Math.abs(dx) * W + Math.abs(dy) * H) / 2
  const g = ctx.createLinearGradient(
    W / 2 - dx * halfLen,
    H / 2 - dy * halfLen,
    W / 2 + dx * halfLen,
    H / 2 + dy * halfLen
  )
  preset.stops.forEach((color, i) => {
    g.addColorStop(i / (preset.stops.length - 1), color)
  })
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: CardConfig
) {
  const wm = config.watermark
  if (config.bgType === "none" || !wm.enabled || !wm.text.trim()) return
  const n = clamp(Math.round(wm.density), 2, 10)
  const cw = W / n
  const ch = H / n
  ctx.save()
  ctx.globalAlpha = clamp(wm.opacity, 0, 0.75)
  ctx.fillStyle = wm.color
  ctx.font = font(400, wm.fontSize * (W / BASE_W))
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      ctx.save()
      ctx.translate(c * cw + cw / 2, r * ch + ch / 2)
      ctx.rotate((wm.rotation * Math.PI) / 180)
      ctx.fillText(wm.text, 0, 0)
      ctx.restore()
    }
  }
  ctx.restore()
}

function drawCardPage(
  ctx: CanvasRenderingContext2D,
  input: ShareCardInput,
  config: CardConfig,
  avatarImg: HTMLImageElement | null,
  customBgImg: HTMLImageElement | null,
  lines: string[],
  pageIndex: number,
  totalPages: number,
  plan: CardPlan,
  blocks: CardMediaBlock[] = [],
  mediaImgs: (HTMLImageElement | null)[] = []
) {
  const { W, H } = plan
  const s = W / BASE_W
  const body = bodyMetrics(config)
  const pad = config.outerPadding * s
  const cardX = pad
  const cardW = W - 2 * pad

  const isLast = pageIndex === totalPages - 1
  const innerW = cardW - config.paddingX * 2 * s
  // 媒体块计入卡片高度（与规划器同公式），否则卡片偏矮、媒体溢出底边
  const mediaHUs =
    isLast && blocks.length > 0
      ? MEDIA_GAP + blocks.reduce((acc, b) => acc + (innerW / s) * b.aspect + MEDIA_GAP, 0)
      : 0
  const contentH =
    (PAD_TOP +
      headerBlockH(config) +
      (headerVisible(config) ? body.lh * 0.42 : 0) +
      lines.length * body.lh +
      mediaHUs +
      footerHeightUnscaled(config, input) +
      PAD_BOTTOM) *
    s
  const availH = H - 2 * pad
  const cardH = Math.min(contentH, availH)
  const cardY =
    config.align === "top" ? pad : config.align === "bottom" ? H - pad - cardH : (H - cardH) / 2

  drawBackground(ctx, W, H, config, customBgImg)
  drawWatermark(ctx, W, H, config)

  // 卡片（描边环 + 阴影；尺寸均为基准 px × s）
  const cardShortEdge = Math.min(cardW, cardH)
  const radius = clamp(config.cornerRadius * s, 0, cardShortEdge / 2)
  const ringVisible =
    config.borderEnabled && config.borderThickness > 0 && config.borderOpacity > 0.0001
  const ringW = ringVisible ? config.borderThickness * s : 0
  const shadow = shadowCss(config.shadow, config.shadowStyle, cardShortEdge)

  ctx.save()
  if (shadow) {
    const m = shadow.match(/rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/)
    if (m) {
      ctx.shadowColor = `rgba(${m[1]},${m[2]},${m[3]},${m[4]})`
      const blur = Number(shadow.match(/ (\d+(?:\.\d+)?)px (\d+(?:\.\d+)?)px/)?.[2] ?? 0)
      const offsetY = Number(shadow.match(/^0 (-?\d+(?:\.\d+)?)px/)?.[1] ?? 0)
      ctx.shadowBlur = blur
      ctx.shadowOffsetY = offsetY
    }
  }
  if (ringVisible) {
    ctx.fillStyle = hexToRgba(config.borderColor, config.borderOpacity)
    roundRectPath(ctx, cardX - ringW, cardY - ringW, cardW + 2 * ringW, cardH + 2 * ringW, radius + ringW)
    ctx.fill()
  } else {
    ctx.fillStyle = "#ffffff"
    roundRectPath(ctx, cardX, cardY, cardW, cardH, radius)
    ctx.fill()
  }
  ctx.restore()
  // 描边环之上再画白卡
  ctx.fillStyle = "#ffffff"
  roundRectPath(ctx, cardX, cardY, cardW, cardH, radius)
  ctx.fill()

  // ---- 头部（头像/名称/ID 逐项显隐） ----
  const hcfg = config.header
  const headerX = cardX + config.paddingX * s
  const headerTop = cardY + PAD_TOP * s
  const avatarX = headerX
  const avatarY = headerTop
  const avatarR = (AVATAR_D * s) / 2
  const avatarCx = avatarX + avatarR
  const avatarCy = avatarY + avatarR
  const textCenterY = headerTop + (HEADER_H * s) / 2

  if (hcfg.avatar) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    if (avatarImg) {
      const scale = Math.max((avatarR * 2) / avatarImg.width, (avatarR * 2) / avatarImg.height)
      const dw = avatarImg.width * scale
      const dh = avatarImg.height * scale
      ctx.drawImage(avatarImg, avatarCx - dw / 2, avatarCy - dh / 2, dw, dh)
    } else {
      ctx.fillStyle = COLOR_ACCENT
      ctx.fillRect(avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2)
      ctx.fillStyle = "#ffffff"
      ctx.font = font(600, 76 * s)
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText((effectiveAuthorName(input, config) || "X")[0]?.toUpperCase() ?? "X", avatarCx, avatarCy + 5 * s)
    }
    ctx.restore()
  }

  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  const nameX = hcfg.avatar ? avatarX + AVATAR_D * s + 44 * s : headerX
  let nameWidth = 0
  const displayName = effectiveAuthorName(input, config) || "X 用户"

  // 名称绘制：先逐级缩小字号（最小 0.62 倍）适配，再不够则截断加省略号（与 DOM 引擎同策略）
  const drawFittedText = (text: string, baseFont: number, maxW: number, y: number): number => {
    let size = baseFont
    const step = Math.max(1, Math.round(baseFont * 0.04))
    while (size > baseFont * 0.62) {
      ctx.font = font(700, size)
      if (ctx.measureText(text).width <= maxW) break
      size -= step
    }
    ctx.font = font(700, size)
    if (ctx.measureText(text).width <= maxW) {
      ctx.fillText(text, nameX, y)
      return ctx.measureText(text).width
    }
    let truncated = text
    while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxW) {
      truncated = truncated.slice(0, -1)
    }
    ctx.fillText(`${truncated}…`, nameX, y)
    return ctx.measureText(`${truncated}…`).width
  }

  if (hcfg.name) {
    const nameBaseline = hcfg.handle ? textCenterY - 22 * s : textCenterY + 22 * s
    const nameMaxW = cardX + cardW - config.paddingX * s - nameX - (input.verified ? 90 * s : 0)
    ctx.fillStyle = COLOR_TEXT
    nameWidth = drawFittedText(displayName, NAME_FONT * s, nameMaxW, nameBaseline)

    if (input.verified) {
      const badgeR = 20 * s
      const badgeCx = nameX + nameWidth + 36 * s
      const badgeCy = nameBaseline - 22 * s
      ctx.fillStyle = COLOR_ACCENT
      ctx.beginPath()
      ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 4.5 * s
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.beginPath()
      ctx.moveTo(badgeCx - badgeR * 0.45, badgeCy)
      ctx.lineTo(badgeCx - badgeR * 0.1, badgeCy + badgeR * 0.35)
      ctx.lineTo(badgeCx + badgeR * 0.48, badgeCy - badgeR * 0.35)
      ctx.stroke()
    }
  }

  const displayHandle = effectiveAuthorHandle(input, config)
  if (hcfg.handle && displayHandle) {
    ctx.fillStyle = COLOR_SUB
    const handleBaseline = hcfg.name ? textCenterY + 58 * s : textCenterY + 22 * s
    const handleMaxW = cardX + cardW - config.paddingX * s - nameX
    let size = HANDLE_FONT * s
    const step = Math.max(1, Math.round(HANDLE_FONT * s * 0.04))
    ctx.font = font(400, size)
    while (ctx.measureText(displayHandle).width > handleMaxW && size > HANDLE_FONT * s * 0.62) {
      size -= step
      ctx.font = font(400, size)
    }
    let handleText = displayHandle
    if (ctx.measureText(handleText).width > handleMaxW) {
      while (handleText.length > 1 && ctx.measureText(`${handleText}…`).width > handleMaxW) {
        handleText = handleText.slice(0, -1)
      }
      handleText = `${handleText}…`
    }
    ctx.fillText(handleText, nameX, handleBaseline)
  }

  // ---- 正文 ----
  const bodyTop =
    cardY + (PAD_TOP + headerBlockH(config)) * s + (headerVisible(config) ? body.lh * s * 0.42 : 0)
  const footerReserve = isLast ? footerHeightUnscaled(config, input) : PAGE_PILL_H + 14
  const bodyLimit = cardY + cardH - PAD_BOTTOM * s - footerReserve * s
  const cap = Math.max(1, Math.floor((bodyLimit - bodyTop) / (body.lh * s)))
  const safeLines = lines.length > cap ? lines.slice(0, cap) : lines

  ctx.fillStyle = COLOR_TEXT
  ctx.font = font(400, body.font * s)
  safeLines.forEach((line, i) => {
    if (line) {
      ctx.fillText(line, cardX + config.paddingX * s, bodyTop + i * body.lh * s)
    }
  })

  // ---- 媒体（末页正文之后；图片 cover 裁切 + 圆角，视频叠播放按钮） ----
  if (isLast && blocks.length > 0) {
    let my = bodyTop + safeLines.length * body.lh * s + MEDIA_GAP * s
    blocks.forEach((b, i) => {
      const mh = innerW * b.aspect
      const img = mediaImgs[i]
      const mx = cardX + config.paddingX * s
      const r = MEDIA_RADIUS * s
      ctx.save()
      roundRectPath(ctx, mx, my, innerW, mh, r)
      ctx.clip()
      if (img) {
        const scale = Math.max(innerW / img.width, mh / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        ctx.drawImage(img, mx + (innerW - dw) / 2, my + (mh - dh) / 2, dw, dh)
      } else {
        ctx.fillStyle = "#e9edf0"
        ctx.fillRect(mx, my, innerW, mh)
      }
      ctx.restore()
      if (b.source.kind === "video") {
        // 播放按钮：半透明圆 + 白色三角
        const cx = mx + innerW / 2
        const cy = my + mh / 2
        const br = Math.min(innerW, mh) * 0.11
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
      my += mh + MEDIA_GAP * s
    })
  }

  // ---- 页脚 ----
  const cardBottom = cardY + cardH - PAD_BOTTOM * s
  if (isLast) {
    if (metaRowVisible(config, input)) {
      const metaBaseline = bodyLimit + META_GAP * s + META_FONT * s
      let mx = cardX + config.paddingX * s
      const segments: { text: string; color: string; weight: number }[] = []
      if (input.dateText) {
        segments.push({ text: input.dateText, color: COLOR_SUB, weight: 400 })
      }
      const views = viewsText(config, input)
      if (config.metrics.views.show && views) {
        if (segments.length > 0) {
          segments.push({ text: " · ", color: COLOR_SUB, weight: 400 })
        }
        segments.push({ text: views, color: COLOR_META_STRONG, weight: 600 })
        segments.push({ text: " 次浏览", color: COLOR_SUB, weight: 400 })
      }
      for (const seg of segments) {
        ctx.font = font(seg.weight, META_FONT * s)
        ctx.fillStyle = seg.color
        ctx.fillText(seg.text, mx, metaBaseline)
        mx += ctx.measureText(seg.text).width
      }
    }

    const groups = metricsRowVisible(config, input) ? metricsGroups(config, input) : []
    if (groups.length > 0) {
      const interRowTop = cardBottom - ICON_ROW_H * s
      const iconS = ICON_SIZE * s
      const rowY = interRowTop + (ICON_ROW_H * s - iconS) / 2
      const innerW = cardW - config.paddingX * 2 * s
      ctx.font = font(400, ICON_FONT * s)
      ctx.textBaseline = "middle"
      const groupWidth = (key: string, count: string) =>
        iconS + (count ? 18 * s + ctx.measureText(count).width : 0)
      const totalW = groups.reduce((acc, [key, count]) => acc + groupWidth(key, count), 0)
      const gap = groups.length > 1 ? (innerW - totalW) / (groups.length - 1) : 0
      let gx = cardX + config.paddingX * s
      for (const [key, count] of groups) {
        drawLucideIcon(ctx, ICON_PATHS[key], gx, rowY, iconS, COLOR_SUB)
        if (count) {
          ctx.fillStyle = COLOR_SUB
          ctx.fillText(count, gx + iconS + 18 * s, rowY + iconS / 2)
        }
        gx += groupWidth(key, count) + gap
      }
      ctx.textBaseline = "alphabetic"
    }

    if (totalPages > 1) {
      ctx.fillStyle = COLOR_SUB
      ctx.font = font(400, PAGE_FONT * s)
      ctx.textAlign = "right"
      ctx.fillText(`${pageIndex + 1} / ${totalPages}`, cardX + cardW - config.paddingX * s, cardY + cardH - PAD_BOTTOM * s)
      ctx.textAlign = "left"
    }
  } else if (totalPages > 1) {
    // 非末页：底部居中的页码药丸
    ctx.font = font(400, PAGE_FONT * s)
    const label = `${pageIndex + 1} / ${totalPages}`
    const textW = ctx.measureText(label).width
    const pillW = textW + 56 * s
    const pillH = PAGE_PILL_H * s
    const pillX = cardX + (cardW - pillW) / 2
    const pillY = cardBottom - pillH
    ctx.fillStyle = COLOR_PILL_BG
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()
    ctx.fillStyle = COLOR_SUB
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 2 * s)
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
  }
}

// ---------- 资源准备 ----------
async function prepareAssets(input: ShareCardInput, config: CardConfig, mediaSizes?: (MediaSize | null)[]) {
  const avatarUrl = effectiveAvatarUrl(input, config)
  const avatarDataUrl = avatarUrl ? await fetchAvatarDataUrl(avatarUrl) : null
  const avatarImg = avatarDataUrl
    ? await loadImageCached(`avatar:${avatarUrl}`, avatarDataUrl)
    : null
  const customBgImg =
    config.bgType === "custom" && config.bgCustomDataUrl
      ? await loadImageCached(`bg:${config.bgCustomDataUrl.slice(0, 128)}:${config.bgCustomDataUrl.length}`, config.bgCustomDataUrl)
      : null
  // 卡片媒体（图片原图 / 视频封面帧），经 background 代抓绕过 CORS
  const blocks = mediaBlocks(input, config, mediaSizes)
  const mediaImgs = await Promise.all(
    blocks.map(async (b) => {
      const srcUrl = cardMediaSrc(b.source)
      const dataUrl = await fetchAvatarDataUrl(srcUrl)
      return dataUrl ? await loadImageCached(`cardmedia:${srcUrl}`, dataUrl) : null
    })
  )
  return { avatarImg, customBgImg, blocks, mediaImgs }
}

function createCanvas(W: number, H: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  return { canvas, ctx }
}

// ---------- 生成入口：导出 PNG ----------
export async function generateShareCards(
  input: ShareCardInput,
  config: CardConfig
): Promise<TweetMediaItem[]> {
  const mediaSizes = await probeMediaSizes(input, config)
  const plan = planCard(input, config, mediaSizes)
  const { avatarImg, customBgImg, blocks, mediaImgs } = await prepareAssets(input, config, mediaSizes)
  const items: TweetMediaItem[] = []
  for (let p = 0; p < plan.pages.length; p++) {
    const { canvas, ctx } = createCanvas(plan.W, plan.H)
    drawCardPage(ctx, input, config, avatarImg, customBgImg, plan.pages[p], p, plan.pages.length, plan, blocks, mediaImgs)
    const dataUrl = canvas.toDataURL("image/png")
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
}

// ---------- 配置弹窗的实时预览：单页 PNG ----------
export async function renderCardPreview(
  input: ShareCardInput,
  config: CardConfig,
  _unused: null,
  plan: CardPlan,
  pageIndex: number,
  mediaSizes?: (MediaSize | null)[]
): Promise<string> {
  const { avatarImg, customBgImg, blocks, mediaImgs } = await prepareAssets(input, config, mediaSizes)
  const page = Math.min(Math.max(0, pageIndex), plan.pages.length - 1)
  const { canvas, ctx } = createCanvas(plan.W, plan.H)
  drawCardPage(ctx, input, config, avatarImg, customBgImg, plan.pages[page] ?? [], page, plan.pages.length, plan, blocks, mediaImgs)
  return canvas.toDataURL("image/png")
}
