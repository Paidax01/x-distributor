import { useCallback, useEffect, useRef, useState } from "react"
import type { PostMode, SyncData } from "~sync/common"
import { PLATFORMS, resolvePlatformNames } from "~sync/platforms"
import {
  extractTweet,
  withImageSize,
  type ExtractedTweet,
  type TweetMediaItem
} from "~extract/tweet"
import { CARD_LABEL, generateShareCards } from "~card/share-card"
import { renderHtmlCards } from "~card/remote"
import {
  type CardConfig,
  type CardPreset,
  DEFAULT_CARD_CONFIG,
  mergeCardConfig,
  migrateLegacySettings
} from "~card/config"
import donateImg from "data-base64:~assets/donate.png"
import { bus } from "~utils/bus"
import { CardConfigModal } from "./CardConfigModal"
import { MediaList } from "./MediaList"
import { MediaPreviewModal } from "./MediaPreviewModal"
import { PlatformCard } from "./PlatformCard"
import {
  AlertIcon,
  CloseIcon,
  ImageIcon,
  SendIcon,
  SettingsIcon,
  SpinnerIcon,
  VideoIcon
} from "./icons"

const SELECTED_PLATFORMS_KEY = "x-dist-selected-platforms"
const AUTO_PUBLISH_KEY = "x-dist-auto-publish"
const CARD_CONFIG_KEY = "x-dist-card-config-v2"
const CARD_PRESETS_KEY = "x-dist-card-presets-v2"
// 每帖记忆：确认过的用户信息覆盖（名称/ID/头像）与互动数据配置
const TWEET_OVERRIDES_KEY = "x-dist-tweet-overrides-v1"
interface TweetOverrideEntry {
  header: { nameCustom: string; handleCustom: string; avatarCustomDataUrl: string | null }
  metrics: CardConfig["metrics"]
  showMetrics: boolean
}
const cloneMetrics = (m: CardConfig["metrics"]): CardConfig["metrics"] => ({
  replies: { ...m.replies },
  retweets: { ...m.retweets },
  likes: { ...m.likes },
  bookmarks: { ...m.bookmarks },
  share: m.share,
  views: { ...m.views }
})
const LEGACY_CARD_SETTINGS_KEY = "x-dist-card-settings"
const RENDER_ENGINE_KEY = "x-dist-render-engine"
export type RenderEngine = "canvas" | "html"

// 通过页面背景色亮度判断 x.com 当前是深色还是浅色主题
function detectDarkMode(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor
  const m = bg.match(/\d+/g)
  if (!m || m.length < 3) return false
  const [r, g, b] = m.map(Number)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

export function DistributePanel() {
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [media, setMedia] = useState<TweetMediaItem[]>([])
  const [mode, setMode] = useState<PostMode>("DYNAMIC")
  const [detectedMode, setDetectedMode] = useState<PostMode>("DYNAMIC")
  const [platformKeys, setPlatformKeys] = useState<string[]>(PLATFORMS.map((p) => p.key))
  const [autoPublish, setAutoPublish] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // 分享卡片
  const [cardEnabled, setCardEnabled] = useState(false)
  const [generatingCards, setGeneratingCards] = useState(false)
  const [tweetInfo, setTweetInfo] = useState<ExtractedTweet | null>(null)
  const [cardConfig, setCardConfig] = useState<CardConfig>(DEFAULT_CARD_CONFIG)
  const [cardPresets, setCardPresets] = useState<CardPreset[]>([])
  const [tweetOverrides, setTweetOverrides] = useState<Record<string, TweetOverrideEntry>>({})
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  const [renderEngine, setRenderEngine] = useState<RenderEngine>("canvas")
  const cardConfigRef = useRef(cardConfig)
  const genCardsRef = useRef<() => Promise<void>>()
  const [previewItem, setPreviewItem] = useState<TweetMediaItem | null>(null)

  // 恢复上次的平台选择、自动发布与卡片配置/预设（含旧版设置迁移）
  useEffect(() => {
    chrome.storage.local
      .get([
        SELECTED_PLATFORMS_KEY,
        AUTO_PUBLISH_KEY,
        CARD_CONFIG_KEY,
        CARD_PRESETS_KEY,
        TWEET_OVERRIDES_KEY,
        LEGACY_CARD_SETTINGS_KEY,
        RENDER_ENGINE_KEY
      ])
      .then((res) => {
        if (Array.isArray(res[SELECTED_PLATFORMS_KEY])) {
          const saved = res[SELECTED_PLATFORMS_KEY] as string[]
          const valid = saved.filter((key) => PLATFORMS.some((p) => p.key === key))
          if (valid.length > 0) setPlatformKeys(valid)
        }
        if (typeof res[AUTO_PUBLISH_KEY] === "boolean") {
          setAutoPublish(res[AUTO_PUBLISH_KEY] as boolean)
        }
        if (res[RENDER_ENGINE_KEY] === "html" || res[RENDER_ENGINE_KEY] === "canvas") {
          setRenderEngine(res[RENDER_ENGINE_KEY] as RenderEngine)
        }
        const legacy = res[LEGACY_CARD_SETTINGS_KEY] as Record<string, unknown> | undefined
        const savedConfig = res[CARD_CONFIG_KEY] as Partial<CardConfig> | undefined
        // 统一经 mergeCardConfig：嵌套字段兜底 + 旧版比例字段迁移为 px
        if (legacy || savedConfig) {
          setCardConfig(mergeCardConfig({ ...migrateLegacySettings(legacy ?? {}), ...savedConfig }))
        }
        if (Array.isArray(res[CARD_PRESETS_KEY])) {
          setCardPresets(res[CARD_PRESETS_KEY] as CardPreset[])
        }
        if (res[TWEET_OVERRIDES_KEY] && typeof res[TWEET_OVERRIDES_KEY] === "object") {
          setTweetOverrides(res[TWEET_OVERRIDES_KEY] as Record<string, TweetOverrideEntry>)
        }
      })
  }, [])

  useEffect(() => {
    cardConfigRef.current = cardConfig
  }, [cardConfig])

  // 视频解析失败时降级为图文（用视频封面或已提取的图片）
  const degradeToDynamic = useCallback((tweet: ExtractedTweet, message: string) => {
    const poster = tweet.videoPoster
    const posterItem: TweetMediaItem | null = poster
      ? {
          kind: "image",
          url: withImageSize(poster, "orig"),
          thumbUrl: withImageSize(poster, "small"),
          name: "cover.jpg",
          type: "image/jpeg"
        }
      : null
    setMedia(posterItem ? [posterItem, ...tweet.media] : tweet.media)
    setMode("DYNAMIC")
    setNotice(message)
  }, [])

  // 点击操作栏图标 → 提取推文 → 打开面板
  useEffect(() => {
    const off = bus.on("open-panel", async (payload) => {
      const { article } = payload as { article: HTMLElement }
      setDark(detectDarkMode())
      setOpen(true)
      setNotice(null)
      setPublishing(false)
      setTitle("")
      setCardEnabled(false)
      setGeneratingCards(false)
      setConfigOpen(false)

      const tweet = extractTweet(article)
      setTweetInfo(tweet)
      setContent(tweet.text)
      setDetectedMode(tweet.hasVideo ? "VIDEO" : "DYNAMIC")

      if (!tweet.hasVideo) {
        setMedia(tweet.media)
        setMode("DYNAMIC")
        return
      }

      if (!tweet.tweetId) {
        degradeToDynamic(tweet, "未找到推文链接，无法解析视频，已降级为图文模式")
        return
      }

      // 视频帖：先展示 DOM 图片，再异步解析视频直链
      setMedia(tweet.media)
      setLoading(true)
      let res: { ok?: boolean; error?: string; images?: TweetMediaItem[]; video?: TweetMediaItem | null } | undefined
      try {
        res = await chrome.runtime.sendMessage({
          action: "X_DIST_FETCH_TWEET_MEDIA",
          tweetId: tweet.tweetId
        })
      } catch (error) {
        res = { ok: false, error: String(error) }
      }
      setLoading(false)

      if (res?.ok && res.video) {
        setMedia([res.video, ...(res.images ?? [])])
        setMode("VIDEO")
      } else if (res?.ok && (res.images?.length ?? 0) > 0) {
        setMedia(res.images!)
        setMode("DYNAMIC")
        setNotice("未解析到视频地址，已切换为图文模式")
      } else {
        degradeToDynamic(
          tweet,
          `视频解析失败${res?.error ? `（${res.error}）` : ""}，已降级为图文模式`
        )
      }
    })
    return off
  }, [degradeToDynamic])

  // SPA 跳转自动收起：x.com 是单页应用，点击跳转到其他帖子只改地址不刷新页面；
  // 面板打开期间监听地址，一旦变化（切到别的帖子/页面）就收起面板，不常驻
  const openUrlRef = useRef<string>("")
  useEffect(() => {
    if (!open) return
    openUrlRef.current = location.href
    const timer = setInterval(() => {
      if (location.href !== openUrlRef.current) {
        setOpen(false)
      }
    }, 400)
    return () => clearInterval(timer)
  }, [open])

  // Esc 关闭（预览/配置弹层打开时优先关闭弹层，不关面板）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !previewItem && !configOpen) {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, previewItem, configOpen])

  const togglePlatform = (key: string) => {
    setPlatformKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      chrome.storage.local.set({ [SELECTED_PLATFORMS_KEY]: next })
      return next
    })
  }

  const toggleAutoPublish = (checked: boolean) => {
    setAutoPublish(checked)
    chrome.storage.local.set({ [AUTO_PUBLISH_KEY]: checked })
  }

  // ---------- 每帖记忆（用户信息覆盖 + 互动数据） ----------
  // 打开配置弹窗时：这条帖子确认过 → 套用上次配置；没确认过 → 清空覆盖，用推文真实数据
  const applyTweetOverrides = (tweetId: string | null | undefined) => {
    const entry = tweetId ? tweetOverrides[tweetId] : undefined
    setCardConfig((prev) => ({
      ...prev,
      header: entry ? { ...prev.header, ...entry.header } : { ...DEFAULT_CARD_CONFIG.header },
      metrics: cloneMetrics(entry ? entry.metrics : DEFAULT_CARD_CONFIG.metrics),
      showMetrics: entry ? entry.showMetrics : DEFAULT_CARD_CONFIG.showMetrics
    }))
  }

  const persistTweetOverrides = () => {
    const id = tweetInfo?.tweetId
    if (!id) return
    const cfg = cardConfigRef.current
    const entry: TweetOverrideEntry = {
      header: {
        nameCustom: cfg.header.nameCustom,
        handleCustom: cfg.header.handleCustom,
        avatarCustomDataUrl: cfg.header.avatarCustomDataUrl
      },
      metrics: cloneMetrics(cfg.metrics),
      showMetrics: cfg.showMetrics
    }
    setTweetOverrides((prev) => {
      const next = { ...prev, [id]: entry }
      void chrome.storage.local.set({ [TWEET_OVERRIDES_KEY]: next })
      return next
    })
  }

  // ---------- 分享卡片 ----------
  const removeCards = useCallback(() => {
    setMedia((prev) => prev.filter((m) => m.label !== CARD_LABEL))
  }, [])

  const cardConfigSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateCardConfig = useCallback((patch: Partial<CardConfig>) => {
    // 已是 null 时返回同值，React 跳过重渲染
    setActivePresetId((prev) => (prev === null ? prev : null))
    setCardConfig((prev) => {
      const next = { ...prev, ...patch, watermark: { ...prev.watermark, ...(patch.watermark ?? {}) } }
      // 拖滑杆时每帧都会进来：持久化防抖 300ms，避免 storage 写入风暴拖慢预览跟手
      if (cardConfigSaveTimerRef.current) clearTimeout(cardConfigSaveTimerRef.current)
      cardConfigSaveTimerRef.current = setTimeout(() => {
        cardConfigSaveTimerRef.current = null
        void chrome.storage.local.set({ [CARD_CONFIG_KEY]: next })
      }, 300)
      return next
    })
  }, [])

  const applyCardPreset = useCallback((preset: CardPreset) => {
    setCardConfig(mergeCardConfig(preset.config))
    setActivePresetId(preset.id)
    void chrome.storage.local.set({ [CARD_CONFIG_KEY]: preset.config })
  }, [])

  const saveCardPreset = useCallback(
    (name: string) => {
      const preset: CardPreset = {
        id: crypto.randomUUID(),
        name,
        // 预设不含互动数据：只保留用户名称/ID/头像与样式配置
        config: { ...cardConfig, metrics: cloneMetrics(DEFAULT_CARD_CONFIG.metrics) }
      }
      setCardPresets((prev) => {
        const next = [...prev.filter((p) => p.name.toLowerCase() !== name.toLowerCase()), preset]
        void chrome.storage.local.set({ [CARD_PRESETS_KEY]: next })
        return next
      })
      setActivePresetId(preset.id)
    },
    [cardConfig]
  )

  const deleteCardPreset = useCallback((id: string) => {
    setCardPresets((prev) => {
      const next = prev.filter((p) => p.id !== id)
      void chrome.storage.local.set({ [CARD_PRESETS_KEY]: next })
      return next
    })
    setActivePresetId((prev) => (prev === id ? null : prev))
  }, [])

  const genCards = useCallback(async () => {
    if (!tweetInfo) return
    const textForCard = content.trim()
    if (!textForCard) {
      setNotice("正文为空，无法生成分享卡片")
      return
    }
    setGeneratingCards(true)
    try {
      const cardInput = {
        authorName: tweetInfo.authorName,
        authorHandle: tweetInfo.authorHandle,
        avatarUrl: tweetInfo.avatarUrl,
        verified: tweetInfo.verified,
        text: textForCard,
        dateText: tweetInfo.dateText,
        stats: tweetInfo.stats,
        // 推文媒体（图片/视频封面）进卡片；过滤掉已生成的卡片自身
        media: tweetInfo.media
          .filter((m) => m.label !== CARD_LABEL)
          .map((m) => ({ kind: m.kind, url: m.url, thumbUrl: m.thumbUrl }))
      }
      let items
      if (renderEngine === "html") {
        // HTML 引擎：经扩展渲染窗口光栅化
        const res = await renderHtmlCards(cardInput, cardConfigRef.current)
        if (!res) throw new Error("background 无响应（扩展需要重新加载？）")
        if (!res.ok || !res.items) throw new Error(res.error || "HTML 渲染失败（可切回 Canvas 引擎）")
        items = res.items
      } else {
        // Canvas 引擎：内容脚本内同步直绘
        items = await generateShareCards(cardInput, cardConfigRef.current)
      }
      setMedia((prev) => [...items, ...prev.filter((m) => m.label !== CARD_LABEL)])
      setCardEnabled(true)
    } catch (error) {
      setNotice(`分享卡片生成失败：${String(error)}`)
      setCardEnabled(false)
    } finally {
      setGeneratingCards(false)
    }
  }, [tweetInfo, content, renderEngine])

  useEffect(() => {
    genCardsRef.current = genCards
  }, [genCards])

  // 卡片开启期间：配置变化（或首次开启）时自动重新生成。
  // 配置弹窗打开时跳过（弹窗内拖滑杆每 300ms 全量出图会与实时预览抢主线程），
  // 关闭弹窗后补跑一次；「确定」按钮自身也会触发生成
  useEffect(() => {
    if (!cardEnabled || configOpen) return
    const timer = setTimeout(() => {
      void genCardsRef.current?.()
    }, 300)
    return () => clearTimeout(timer)
  }, [cardEnabled, cardConfig, configOpen])

  const toggleCard = (checked: boolean) => {
    if (checked) {
      setCardEnabled(true) // 生成由上方 effect 触发
    } else {
      setCardEnabled(false)
      removeCards()
    }
  }

  // 卡片仅用于图文模式，切到视频时移除已生成的卡片
  const switchMode = (next: PostMode) => {
    if (next === "VIDEO" && cardEnabled) {
      setCardEnabled(false)
      removeCards()
    }
    setMode(next)
  }

  const hasImage = media.some((m) => m.kind === "image")
  const hasVideoItem = media.some((m) => m.kind === "video")

  // 图文模式下抖音/小红书不支持纯文字
  const platformDisabled = (key: string): boolean => {
    if (mode === "VIDEO") return !hasVideoItem
    return key !== "okjike" && !hasImage
  }

  const disabledReason =
    mode === "VIDEO" ? "没有可用的视频" : "纯文字帖不支持该平台（即刻除外）"

  const handlePublish = async () => {
    const selected = platformKeys.filter((key) => !platformDisabled(key))
    if (selected.length === 0) {
      setNotice("请至少选择一个可用的平台")
      return
    }

    const images = media.filter((m) => m.kind === "image")
    const video = media.find((m) => m.kind === "video")

    if (mode === "VIDEO") {
      if (!video) {
        setNotice("没有可发布的视频")
        return
      }
    } else if (images.length === 0 && content.trim() === "") {
      setNotice("内容和图片不能都为空")
      return
    }

    const syncData: SyncData = {
      platforms: resolvePlatformNames(selected, mode).map((name) => ({ name })),
      isAutoPublish: autoPublish,
      data:
        mode === "VIDEO"
          ? {
              title,
              content,
              video: { url: video!.url, name: video!.name, type: video!.type },
              tags: []
            }
          : {
              title,
              content,
              images: images.map((m) => ({ url: m.url, name: m.name, type: m.type })),
              videos: [],
              tags: []
            }
    }

    setPublishing(true)
    try {
      await chrome.runtime.sendMessage({ action: "X_DIST_OPEN_PUBLISH", data: syncData })
      setOpen(false)
    } catch (error) {
      setPublishing(false)
      setNotice(`提交失败：${String(error)}`)
    }
  }

  if (!open) return null

  const cardItems = media.filter((m) => m.label === CARD_LABEL)

  return (
    <div className={dark ? "dark" : ""}>
      <div
        className="fixed z-[9999] flex max-h-[calc(100vh-24px)] w-[400px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-[#16181c] dark:text-neutral-100"
        style={{ top: "50%", transform: "translateY(-50%)", right: 16 }}>
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SendIcon className="h-4 w-4 text-sky-500" />
            分发帖子
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setOpen(false)}
            className="rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* 类型识别 + 手动切换 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {loading ? (
                <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <SpinnerIcon className="h-3.5 w-3.5" />
                  正在解析视频地址…
                </span>
              ) : mode === "VIDEO" ? (
                <span className="flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400">
                  <VideoIcon className="h-3.5 w-3.5" />
                  {detectedMode === "VIDEO" ? "已识别：视频帖" : "已切换：视频"}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {detectedMode === "DYNAMIC" ? "已识别：图文帖" : "已切换：图文"}
                </span>
              )}
            </div>
            <div className="flex rounded-lg bg-neutral-100 p-1 text-sm dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => switchMode("DYNAMIC")}
                className={`rounded-md px-3.5 py-1.5 transition-colors ${
                  mode === "DYNAMIC" ? "bg-white font-semibold shadow-sm dark:bg-neutral-600" : "text-neutral-500"
                }`}>
                图文贴
              </button>
              <button
                type="button"
                onClick={() => switchMode("VIDEO")}
                disabled={!hasVideoItem}
                title={!hasVideoItem ? "该帖没有可用的视频" : undefined}
                className={`rounded-md px-3.5 py-1.5 transition-colors disabled:opacity-40 ${
                  mode === "VIDEO" ? "bg-white font-semibold shadow-sm dark:bg-neutral-600" : "text-neutral-500"
                }`}>
                视频贴
              </button>
            </div>
          </div>

          {notice && (
            <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* 标题（可选） */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={55}
            placeholder="标题（可选，抖音/小红书使用；留空则截取正文）"
            className="w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-400 dark:border-neutral-700"
          />

          {/* 正文 */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="要发布的正文…"
            className="w-full resize-y rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-400 dark:border-neutral-700"
          />

          {/* 媒体 */}
          {media.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-neutral-500">媒体（{media.length}，点击可放大预览）</div>
              <MediaList
                items={media}
                onRemove={(index) => setMedia((prev) => prev.filter((_, i) => i !== index))}
                onPreview={setPreviewItem}
              />
            </div>
          )}

          {/* 分享卡片：开关 + 配置入口（仅图文贴；视频贴无卡片形态） */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-700" style={mode === "VIDEO" ? { display: "none" } : undefined}>
            <div className="min-w-0 pr-1">
              <div className="text-sm">生成分享卡片</div>
              <div className="text-xs leading-4 text-neutral-500">
                推文卡片图（长文自动分多张），置于图片最前
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {generatingCards ? (
                <div className="flex w-9 justify-center" title="正在生成卡片…">
                  <SpinnerIcon className="h-4 w-4 text-neutral-400" />
                </div>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={cardEnabled}
                  disabled={mode === "VIDEO"}
                  title={mode === "VIDEO" ? "分享卡片仅图文模式可用" : undefined}
                  onClick={() => toggleCard(!cardEnabled)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                    cardEnabled ? "bg-sky-500" : "bg-neutral-300 dark:bg-neutral-600"
                  }`}>
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      cardEnabled ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  // 打开配置：清空预设选中（默认不选任何预设），并套用每帖记忆
                  setActivePresetId(null)
                  applyTweetOverrides(tweetInfo?.tweetId)
                  setConfigOpen(true)
                }}
                title="卡片配置（背景/布局/比例/水印等）"
                disabled={mode === "VIDEO"}
                className="flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600 transition-colors hover:border-sky-400 hover:text-sky-500 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-300">
                <SettingsIcon className="h-3.5 w-3.5" />
                配置
              </button>
            </div>
          </div>

          {cardEnabled && cardItems.length > 0 && (
            <button
              type="button"
              disabled={generatingCards}
              onClick={() => {
                for (const item of cardItems) {
                  const a = document.createElement("a")
                  a.href = item.url
                  a.download = item.name
                  a.click()
                }
              }}
              className="w-full rounded-full border border-sky-500 py-1.5 text-xs font-medium text-sky-600 transition-colors hover:bg-sky-50 disabled:opacity-50 dark:text-sky-400 dark:hover:bg-sky-500/10">
              下载卡片 PNG（{cardItems.length} 张）
            </button>
          )}

          {/* 平台选择 */}
          <div className="space-y-1.5">
            <div className="text-xs text-neutral-500">分发平台</div>
            <div className="space-y-2">
              {PLATFORMS.map((p) => (
                <PlatformCard
                  key={p.key}
                  platformKey={p.key}
                  name={p.name}
                  selected={platformKeys.includes(p.key)}
                  disabled={platformDisabled(p.key)}
                  disabledReason={disabledReason}
                  onToggle={() => togglePlatform(p.key)}
                />
              ))}
            </div>
          </div>

          {/* 自动发布 */}
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
            <div>
              <div className="text-sm">自动点击发布按钮</div>
              <div className="text-xs text-neutral-500">关闭时仅填好表单，由你在各平台确认发布</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoPublish}
              onClick={() => toggleAutoPublish(!autoPublish)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                autoPublish ? "bg-sky-500" : "bg-neutral-300 dark:bg-neutral-600"
              }`}>
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                  autoPublish ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </label>
        </div>

        {/* 底部发布 */}
        <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-600 disabled:opacity-60">
            {publishing ? (
              <>
                <SpinnerIcon className="h-4 w-4" />
                正在提交…
              </>
            ) : (
              <>
                <SendIcon className="h-4 w-4" />
                分发到 {platformKeys.filter((k) => !platformDisabled(k)).length} 个平台
              </>
            )}
          </button>

          {/* 作者栏：左 by 派大鑫 / 打赏，右 平台主页链接 */}
          <div className="mt-2.5 flex items-center justify-between px-1 pb-0.5 text-[13px] text-neutral-400">
            <div className="flex items-center gap-2">
              <span>by 派大鑫</span>
              <button
                type="button"
                onClick={() => setDonateOpen(true)}
                className="transition-colors hover:text-amber-500">
                打赏
              </button>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://www.xiaohongshu.com/user/profile/5a2e96aab1da1465364b727b"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-sky-500">
                小红书
              </a>
              <a
                href="https://www.douyin.com/user/MS4wLjABAAAAhrXRsbn5nabeJQoh9vCnHq40VI5ycd7lMOZJ0o3VQh8?from_tab_name=main&vid=7638626095344654335"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-sky-500">
                抖音
              </a>
              <a
                href="https://x.com/xin_pai88825"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-sky-500">
                X
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 打赏弹窗 */}
      {donateOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDonateOpen(false)}>
          <div
            className="relative rounded-2xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setDonateOpen(false)}
              aria-label="关闭"
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65">
              ×
            </button>
            <img src={donateImg} alt="赞赏码" className="max-h-[64vh] max-w-[280px] rounded-lg" />
            <div className="pb-1 pt-2 text-center text-xs text-neutral-500">
              感谢支持，祝你生活愉快
            </div>
          </div>
        </div>
      )}

      {previewItem && <MediaPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}

      {configOpen && tweetInfo && (
        <CardConfigModal
          input={{
            authorName: tweetInfo.authorName,
            authorHandle: tweetInfo.authorHandle,
            avatarUrl: tweetInfo.avatarUrl,
            verified: tweetInfo.verified,
            text: content.trim() || tweetInfo.text,
            dateText: tweetInfo.dateText,
            stats: tweetInfo.stats,
            media: tweetInfo.media
              .filter((m) => m.label !== CARD_LABEL)
              .map((m) => ({ kind: m.kind, url: m.url, thumbUrl: m.thumbUrl }))
          }}
          config={cardConfig}
          content={content}
          onContentChange={setContent}
          presets={cardPresets}
          activePresetId={activePresetId}
          onChange={updateCardConfig}
          onApplyPreset={applyCardPreset}
          onSavePreset={saveCardPreset}
          onDeletePreset={deleteCardPreset}
          onClose={() => setConfigOpen(false)}
          onConfirm={() => {
            setConfigOpen(false)
            persistTweetOverrides()
            void genCardsRef.current?.()
          }}
        />
      )}
    </div>
  )
}
