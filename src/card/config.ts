// 分享卡片配置模型与内置资产
// 填充库（纯色/渐变/壁纸）+ 布局滑杆（外边距/内边距/阴影/圆角）+ 阴影样式档位 +
// 对齐 + 比例 + 预设系统 + 水印 + 媒体/用户信息/互动数据展示配置

export type BgType = "none" | "solid" | "gradient" | "custom"
export type ShadowStyleKey = "soft" | "long" | "glow" | "crisp"
export type CardAlign = "top" | "center" | "bottom"
export type CardRatioKey =
  | "auto"
  | "1:1"
  | "4:3"
  | "3:2"
  | "16:9"
  | "2:3"
  | "3:4"
  | "9:16"
  | "custom"

export interface WatermarkConfig {
  enabled: boolean
  text: string
  density: number // 每边数量 2–10
  fontSize: number // px（基准 1920 宽下）8–160
  rotation: number // 度 -90–90
  opacity: number // 0–0.75
  color: string
}

// 用户信息（头像/名称/ID）逐项显隐 + 自定义覆盖（空值 = 用推文真实数据）
export interface HeaderConfig {
  avatar: boolean
  avatarCustomDataUrl: string | null // 上传自定义头像
  name: boolean
  nameCustom: string // "" = 推文作者名
  handle: boolean
  handleCustom: string // "" = 推文作者 handle
}

// 单项互动数据：show 显隐；value 非空时覆盖推文真实数据（支持 "1.2万" 等文本）
export interface MetricToggle {
  show: boolean
  value: string
}

// 互动数据逐项配置（share 仅图标无数字）
export interface MetricsConfig {
  replies: MetricToggle
  retweets: MetricToggle
  likes: MetricToggle
  bookmarks: MetricToggle
  share: boolean
  views: MetricToggle // views = 日期行的「N 次浏览」段
}

export const DEFAULT_METRICS: MetricsConfig = {
  replies: { show: true, value: "" },
  retweets: { show: true, value: "" },
  likes: { show: true, value: "" },
  bookmarks: { show: true, value: "" },
  share: true,
  views: { show: true, value: "" }
}

export const DEFAULT_HEADER: HeaderConfig = {
  avatar: true,
  avatarCustomDataUrl: null,
  name: true,
  nameCustom: "",
  handle: true,
  handleCustom: ""
}

// 卡片内展示推文媒体（图片/视频封面）
export interface CardMediaConfig {
  show: boolean
  hiddenUrls: string[] // 被取消勾选的媒体地址（按 TweetMediaItem.url 匹配）
  aspect: "fixed" | "original" // 固定 16:9 / 按图片原始比例
}

export interface CardConfig {
  bgType: BgType
  bgSolidId: string
  bgGradientId: string
  bgCustomDataUrl: string | null
  // 长度类均为「基准 1920 宽下的 px」，渲染时按 s = W/1920 等比缩放
  outerPadding: number // 卡片与画布边缘的外边距 px 0–460
  paddingX: number // 卡片内左右内边距 px 0–100
  cornerRadius: number // 圆角 px 0–200
  shadow: number // 强度 0–1
  shadowStyle: ShadowStyleKey
  borderEnabled: boolean
  borderColor: string
  borderThickness: number // 描边粗细 px 0–60
  borderOpacity: number // 0–1
  ratio: CardRatioKey
  customW: string
  customH: string
  align: CardAlign
  textScale: number // 内容大小 0.75–1.5
  showMetrics: boolean
  metrics: MetricsConfig
  header: HeaderConfig
  media: CardMediaConfig
  watermark: WatermarkConfig
}

export const DEFAULT_CARD_CONFIG: CardConfig = {
  bgType: "gradient",
  bgSolidId: "graphite",
  bgGradientId: "steel",
  bgCustomDataUrl: null,
  outerPadding: 154,
  paddingX: 96,
  cornerRadius: 35,
  shadow: 0.36,
  shadowStyle: "soft",
  borderEnabled: false,
  borderColor: "#ffffff",
  borderThickness: 23,
  borderOpacity: 1,
  ratio: "3:4",
  customW: "1080",
  customH: "1440",
  align: "center",
  textScale: 1,
  showMetrics: true,
  metrics: DEFAULT_METRICS,
  header: DEFAULT_HEADER,
  media: { show: true, hiddenUrls: [], aspect: "fixed" },
  watermark: {
    enabled: false,
    text: "",
    density: 4,
    fontSize: 72,
    rotation: 45,
    opacity: 0.18,
    color: "#e6e6e6"
  }
}

// 合并已保存配置：嵌套对象逐字段兜底 + 旧版「相对比例」字段迁移为 px 值。
// 旧字段语义：padding/cornerRadius/borderThickness 曾是 0~1 的相对比例（×1920 ≈ px 值）；
// metrics/header 曾是纯布尔（v4 起为对象）
function normalizeMetric(m: unknown): MetricToggle {
  if (typeof m === "boolean") return { show: m, value: "" }
  if (m && typeof m === "object") {
    const o = m as Partial<MetricToggle>
    return { show: o.show ?? true, value: typeof o.value === "string" ? o.value : "" }
  }
  return { show: true, value: "" }
}

function normalizeHeader(h: unknown): HeaderConfig {
  const d = DEFAULT_HEADER
  if (!h || typeof h !== "object") return { ...d }
  const o = h as Partial<HeaderConfig> & Record<string, unknown>
  return {
    avatar: typeof o.avatar === "boolean" ? o.avatar : d.avatar,
    avatarCustomDataUrl:
      typeof o.avatarCustomDataUrl === "string" ? o.avatarCustomDataUrl : o.avatarCustomDataUrl ?? null,
    name: typeof o.name === "boolean" ? o.name : d.name,
    nameCustom: typeof o.nameCustom === "string" ? o.nameCustom : "",
    handle: typeof o.handle === "boolean" ? o.handle : d.handle,
    handleCustom: typeof o.handleCustom === "string" ? o.handleCustom : ""
  }
}

export function mergeCardConfig(saved: Partial<CardConfig> | null | undefined): CardConfig {
  const base = DEFAULT_CARD_CONFIG
  if (!saved || typeof saved !== "object") {
    return {
      ...base,
      watermark: { ...base.watermark },
      metrics: JSON.parse(JSON.stringify(base.metrics)) as MetricsConfig,
      header: { ...base.header }
    }
  }
  const legacy = saved as Record<string, unknown>
  const merged = { ...base, ...saved } as CardConfig
  merged.watermark = { ...base.watermark, ...((saved.watermark as WatermarkConfig) ?? {}) }
  const rawMetrics = (legacy.metrics ?? {}) as Record<string, unknown>
  merged.metrics = {
    replies: normalizeMetric(rawMetrics.replies),
    retweets: normalizeMetric(rawMetrics.retweets),
    likes: normalizeMetric(rawMetrics.likes),
    bookmarks: normalizeMetric(rawMetrics.bookmarks),
    share: typeof rawMetrics.share === "boolean" ? rawMetrics.share : true,
    views: normalizeMetric(rawMetrics.views)
  }
  merged.header = normalizeHeader(legacy.header)
  if (legacy.media && typeof legacy.media === "object") {
    const m = legacy.media as Partial<CardMediaConfig>
    merged.media = {
      show: typeof m.show === "boolean" ? m.show : true,
      hiddenUrls: Array.isArray(m.hiddenUrls) ? m.hiddenUrls.filter((u) => typeof u === "string") : [],
      aspect: m.aspect === "original" ? "original" : "fixed"
    }
  }
  if (typeof legacy.padding === "number" && legacy.padding <= 1) {
    merged.outerPadding = Math.round(legacy.padding * 1920)
    delete (merged as unknown as Record<string, unknown>).padding
  }
  if (typeof saved.cornerRadius === "number" && saved.cornerRadius <= 0.12) {
    merged.cornerRadius = Math.max(4, Math.round(saved.cornerRadius * 1920))
  }
  if (typeof saved.borderThickness === "number" && saved.borderThickness <= 0.08) {
    merged.borderThickness = Math.max(1, Math.round(saved.borderThickness * 1920))
  }
  return merged
}

// ---------- 展示值解析（自定义覆盖 > 推文真实数据） ----------
export function effectiveAuthorName(input: { authorName: string }, config: CardConfig): string {
  return config.header.nameCustom.trim() || input.authorName
}

export function effectiveAuthorHandle(input: { authorHandle: string }, config: CardConfig): string {
  return config.header.handleCustom.trim() || input.authorHandle
}

export function effectiveAvatarUrl(
  input: { avatarUrl: string | null },
  config: CardConfig
): string | null {
  return config.header.avatarCustomDataUrl || input.avatarUrl
}

// ---------- 填充库：纯色 16 预设 ----------
export interface SolidPreset {
  id: string
  name: string
  css: string
}

export const SOLID_PRESETS: SolidPreset[] = [
  { id: "black", name: "曜黑", css: "#050506" },
  { id: "white", name: "米白", css: "#f5f5f0" },
  { id: "graphite", name: "石墨", css: "#2b2e36" },
  { id: "red", name: "绯红", css: "#f03b47" },
  { id: "orange", name: "暖橙", css: "#f78529" },
  { id: "yellow", name: "明黄", css: "#f5ba3b" },
  { id: "green", name: "森绿", css: "#3b9c5c" },
  { id: "blue", name: "海蓝", css: "#2980e0" },
  { id: "purple", name: "紫罗兰", css: "#7a42e8" },
  { id: "blush", name: "胭脂", css: "#eda89e" },
  { id: "mint", name: "薄荷", css: "#a8e6ba" },
  { id: "sky", name: "晴空", css: "#a1c9f0" },
  { id: "lavender", name: "薰衣草", css: "#ccc2eb" },
  { id: "peach", name: "蜜桃", css: "#faccb0" },
  { id: "sage", name: "鼠尾草", css: "#bdd1b3" },
  { id: "sand", name: "沙岩", css: "#e8dec2" }
]

// ---------- 填充库：渐变 17 预设（3 色标等间距） ----------
export interface GradientPreset {
  id: string
  name: string
  deg: number
  stops: string[]
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: "steel", name: "钢灰", deg: 135, stops: ["#878b91", "#101214"] }, // 本项目原有深空预设
  { id: "aurora", name: "极光", deg: 135, stops: ["#fa4f94", "#6652f2", "#4ad6cc"] },
  { id: "cobalt", name: "钴蓝", deg: 153, stops: ["#0a0d80", "#4230ed", "#6babfa"] },
  { id: "peach", name: "蜜桃", deg: 135, stops: ["#fa615c", "#fcb55c", "#e654a6"] },
  { id: "glass", name: "琉璃", deg: 135, stops: ["#def2f0", "#75c4db", "#4087ed"] },
  { id: "plasma", name: "等离子", deg: 225, stops: ["#140538", "#591fd6", "#f2426b"] },
  { id: "mango", name: "芒果", deg: 135, stops: ["#fcbf33", "#f55436", "#ab30e3"] },
  { id: "mist", name: "薄雾", deg: 135, stops: ["#f0f0eb", "#cce0f0", "#f2c2b3"] },
  { id: "lagoon", name: "湖畔", deg: 45, stops: ["#144d8a", "#40a3b8", "#b3ebc7"] },
  { id: "ember", name: "余烬", deg: 135, stops: ["#2e0814", "#db2b2e", "#ffab40"] },
  { id: "violet", name: "紫暮", deg: 153, stops: ["#3d1482", "#9638f0", "#f56bbd"] },
  { id: "seaGlass", name: "海玻璃", deg: 135, stops: ["#6edbbf", "#409ecc", "#3859bf"] },
  { id: "citrus", name: "柑橘", deg: 225, stops: ["#fce84d", "#70c74a", "#1f946b"] },
  { id: "amethyst", name: "紫晶", deg: 45, stops: ["#1a1447", "#5926a6", "#c263f2"] },
  { id: "sorbet", name: "雪葩", deg: 135, stops: ["#ff7d82", "#ffbd7a", "#8fc7fa"] },
  { id: "mineral", name: "矿石", deg: 135, stops: ["#edf5f2", "#a3b8d1", "#546b8c"] },
  { id: "dawn", name: "黎明", deg: 45, stops: ["#fa9ec4", "#fad178", "#6bb5f5"] }
]

// ---------- 通用色板（描边/水印取色） ----------
export const SWATCHES: string[] = [
  "#ffffff",
  "#f5f5f0",
  "#e6e6e6",
  "#878b91",
  "#2b2e36",
  "#050506",
  "#1d9bf0",
  "#f03b47",
  "#f5ba3b",
  "#3b9c5c"
]

// ---------- 阴影样式档位 ----------
export const SHADOW_STYLES: { key: ShadowStyleKey; name: string; radiusScale: number; yOffsetScale: number; opacityScale: number }[] = [
  { key: "soft", name: "柔和", radiusScale: 1, yOffsetScale: 0.3, opacityScale: 1 },
  { key: "long", name: "修长", radiusScale: 1.2, yOffsetScale: 0.9, opacityScale: 0.85 },
  { key: "glow", name: "光晕", radiusScale: 1.6, yOffsetScale: 0, opacityScale: 0.7 },
  { key: "crisp", name: "锐利", radiusScale: 0.8, yOffsetScale: 0.2, opacityScale: 1.1 }
]

export function getShadowStyle(key: ShadowStyleKey) {
  return SHADOW_STYLES.find((s) => s.key === key) ?? SHADOW_STYLES[0]
}

// 阴影公式：radius = refEdge × 0.17 × strength × radiusScale
// alpha = min(0.5, min(0.35, 0.08 + strength × 1.35) × opacityScale)；yOffset = radius × yOffsetScale
export function shadowCss(strength: number, styleKey: ShadowStyleKey, refEdge: number): string {
  if (strength <= 0.01) return ""
  const style = getShadowStyle(styleKey)
  const radius = refEdge * 0.17 * strength * style.radiusScale
  const alpha = Math.min(0.5, Math.min(0.35, 0.08 + strength * 1.35) * style.opacityScale)
  const y = radius * style.yOffsetScale
  return `0 ${y.toFixed(1)}px ${radius.toFixed(1)}px rgba(0,0,0,${alpha.toFixed(3)})`
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "")
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ---------- 背景 CSS ----------
export function backgroundCss(config: CardConfig): string | null {
  switch (config.bgType) {
    case "none":
      return null // 透明背景（纯卡片）
    case "solid": {
      const preset = SOLID_PRESETS.find((p) => p.id === config.bgSolidId) ?? SOLID_PRESETS[0]
      return preset.css
    }
    case "gradient": {
      const preset = GRADIENT_PRESETS.find((p) => p.id === config.bgGradientId) ?? GRADIENT_PRESETS[0]
      const stops = preset.stops.map((c, i) => `${c} ${Math.round((i / (preset.stops.length - 1)) * 100)}%`)
      return `linear-gradient(${preset.deg}deg, ${stops.join(", ")})`
    }
    case "custom":
      return config.bgCustomDataUrl
        ? `url("${config.bgCustomDataUrl}") center / cover no-repeat`
        : backgroundCss({ ...DEFAULT_CARD_CONFIG, bgType: "gradient" })
    default:
      return null
  }
}

// ---------- 比例 ----------
// 值 = H/W（画布高 = 宽 × 该值）
export const RATIO_VALUE: Record<Exclude<CardRatioKey, "auto" | "custom">, number> = {
  "1:1": 1,
  "4:3": 3 / 4,
  "3:2": 2 / 3,
  "16:9": 9 / 16,
  "2:3": 3 / 2,
  "3:4": 4 / 3,
  "9:16": 16 / 9
}

export const RATIO_PRESETS: { key: CardRatioKey; label: string }[] = [
  { key: "auto", label: "自动" },
  { key: "1:1", label: "1:1" },
  { key: "4:3", label: "4:3" },
  { key: "3:2", label: "3:2" },
  { key: "16:9", label: "16:9" },
  { key: "2:3", label: "2:3" },
  { key: "3:4", label: "3:4" },
  { key: "9:16", label: "9:16" },
  { key: "custom", label: "自定义" }
]

// ---------- 预设（用户保存的配置快照） ----------
export interface CardPreset {
  id: string
  name: string // ≤ 48 字符，重名拒绝
  config: CardConfig
}

// 从旧版设置（v1 卡片设置）迁移到新配置模型
export function migrateLegacySettings(legacy: Record<string, unknown>): Partial<CardConfig> {
  const patch: Partial<CardConfig> = {}
  const bgKey = legacy.bgKey as string | undefined
  if (bgKey === "dark") {
    patch.bgType = "gradient"
    patch.bgGradientId = "steel"
  } else if (bgKey === "light") {
    patch.bgType = "solid"
    patch.bgSolidId = "white"
  } else if (bgKey === "blue") {
    patch.bgType = "gradient"
    patch.bgGradientId = "cobalt"
  } else if (bgKey === "sand") {
    patch.bgType = "solid"
    patch.bgSolidId = "sand"
  } else if (bgKey === "custom") {
    patch.bgType = "custom"
  }
  if (typeof legacy.ratio === "string") patch.ratio = legacy.ratio as CardRatioKey
  if (typeof legacy.customW === "string") patch.customW = legacy.customW
  if (typeof legacy.customH === "string") patch.customH = legacy.customH
  if (typeof legacy.showMetrics === "boolean") patch.showMetrics = legacy.showMetrics
  if (typeof legacy.textScale === "number") patch.textScale = legacy.textScale
  return patch
}
