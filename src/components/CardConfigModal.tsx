import { useCallback, useEffect, useRef, useState } from "react"
import {
  type CardConfig,
  type CardPreset,
  DEFAULT_CARD_CONFIG,
  GRADIENT_PRESETS,
  RATIO_PRESETS,
  RATIO_VALUE,
  SHADOW_STYLES,
  SOLID_PRESETS,
  SWATCHES
} from "~card/config"
import { type ShareCardInput } from "~card/share-card"
import { buildLivePreviewNode } from "~card/share-card-dom"
import { CheckIcon, ChevronDownIcon, CloseIcon, PlusIcon, RefreshIcon, TrashIcon } from "./icons"

// ============================================================
// 配置面板设计系统：Sketch 风格的专业 inspector——统一控件高度/圆角/字号，
// 半透明分层填充，发丝线描边，accent 选中环，可折叠分组。
// ============================================================

const M = {
  horizontalPadding: 12,
  sectionVerticalPadding: 12,
  headerSpacing: 10,
  rowSpacing: 8,
  controlHeight: 24,
  sliderHeight: 32,
  sliderValueWidth: 60,
  fieldRadius: 5,
  sliderRadius: 8,
  controlInset: 2,
  tileRadius: 6,
  labelColumnWidth: 58,
  disclosureHeaderHeight: 38
}

// ---------- 基础控件 ----------
function SectionDivider() {
  return (
    <div
      className="mx-3 h-[0.5px] bg-black/[0.12] dark:bg-white/10"
    />
  )
}

function Section({
  title,
  accessory,
  children
}: {
  title: string
  accessory?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="w-full px-3 py-3" style={{ paddingBottom: M.sectionVerticalPadding }}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-black/85 dark:text-white/85">{title}</span>
        <span className="flex-1" />
        {accessory}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function DisclosureSection({
  title,
  accessory,
  children
}: {
  title: string
  accessory?: React.ReactNode
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="relative w-full">
      <div
        className="flex items-center gap-1.5 px-3 hover:bg-black/[0.025] dark:hover:bg-white/[0.025]"
        style={{ height: M.disclosureHeaderHeight }}>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex flex-1 items-center">
          <span className="text-[11px] font-semibold text-black/[0.88] dark:text-white/[0.88]">{title}</span>
        </button>
        {accessory}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-[18px] w-[18px] items-center justify-center text-black/45 transition-transform duration-150 dark:text-white/45"
          style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <ChevronDownIcon className="h-2.5 w-2.5" />
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>
      )}
      <div className="absolute bottom-0 left-3 right-3 h-[0.5px] bg-black/[0.12] dark:bg-white/10" />
    </div>
  )
}

function IconButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full text-black/45 transition-colors hover:bg-black/[0.08] hover:text-black dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-white">
      {children}
    </button>
  )
}

// 带标签的滑杆：标签画在滑轨内，右侧精确数值输入框（可编辑）
function InspectorSlider({
  title,
  value,
  min,
  max,
  step,
  multiplier,
  suffix,
  fractionDigits,
  onChange
}: {
  title: string
  value: number
  min: number
  max: number
  step: number
  multiplier: number
  suffix: string
  fractionDigits: number
  onChange: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  // 拖动期间的本地即时值：滑块/数值直接跟指针走，不等父级状态往返
  const [dragValue, setDragValue] = useState<number | null>(null)
  const current = dragValue ?? value
  const progress = Math.min(1, Math.max(0, (current - min) / (max - min)))
  const display = (current * multiplier).toFixed(fractionDigits)

  const commitDraft = () => {
    if (draft !== null) {
      const parsed = Number.parseFloat(draft.replace(/[^0-9.\-+]/g, ""))
      if (Number.isFinite(parsed)) {
        const model = parsed / multiplier
        onChange(Math.min(max, Math.max(min, Math.round(model / step) * step)))
      }
    }
    setDraft(null)
  }

  const setFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const raw = min + ratio * (max - min)
    const v = Math.min(max, Math.max(min, Math.round(raw / step) * step))
    setDragValue(v)
    onChange(v)
  }

  const endDrag = () => setDragValue(null)

  return (
    <div className="flex items-center gap-[7px]" style={{ height: M.sliderHeight }}>
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          setFromClientX(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) setFromClientX(e.clientX)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        className="relative flex-1 cursor-ew-resize select-none overflow-hidden border-[0.5px] border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.055]"
        style={{ height: M.sliderHeight, borderRadius: M.sliderRadius }}>
        <div
          className="absolute bg-black/[0.075] dark:bg-white/10"
          style={{
            left: M.controlInset,
            top: M.controlInset,
            bottom: M.controlInset,
            width: `calc(${(progress * 100).toFixed(2)}% - ${(M.controlInset * progress).toFixed(2)}px)`,
            borderRadius: M.sliderRadius - M.controlInset
          }}
        />
        <span
          className="pointer-events-none absolute left-2.5 leading-8 text-[11px] font-medium text-black/[0.78] dark:text-white/[0.78]"
          style={{ lineHeight: `${M.sliderHeight}px` }}>
          {title}
        </span>
      </div>
      <input
        type="text"
        value={draft ?? display + suffix}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitDraft()
        }}
        className="border-[0.5px] border-black/[0.08] bg-black/[0.035] text-center font-mono text-[11px] font-medium text-black/[0.92] outline-none focus:border-[#007aff] dark:border-white/10 dark:bg-white/[0.055] dark:text-white/[0.92] dark:focus:border-[#0a84ff]"
        style={{ width: M.sliderValueWidth, height: M.sliderHeight, borderRadius: M.sliderRadius }}
      />
    </div>
  )
}

// 统一分段控件：与滑杆同高度、共用轨道填充，选中段带发丝描边
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div
      className={`flex border-[0.5px] border-black/10 bg-black/[0.04] p-[2px] dark:border-white/10 dark:bg-white/[0.055] ${
        disabled ? "opacity-45" : ""
      }`}
      style={{ height: M.sliderHeight, borderRadius: M.sliderRadius }}>
      {options.map((opt) => {
        const selected = value === opt.key
        return (
          <button
            key={String(opt.key)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            className={`flex-1 px-2 text-[11px] font-medium transition-colors ${
              selected
                ? "border-[0.5px] border-black/10 bg-black/[0.075] text-black/[0.92] dark:border-white/10 dark:bg-white/10 dark:text-white/[0.92]"
                : "text-black/45 hover:bg-black/[0.04] dark:text-white/45 dark:hover:bg-white/[0.04]"
            }`}
            style={{ borderRadius: M.sliderRadius - M.controlInset }}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// 色块磁贴：静止发丝描边，选中 accent 双环
function Tile({
  title,
  css,
  selected,
  onClick
}: {
  title: string
  css: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`group relative block w-full p-[2.5px]`}>
      <span
        className="block aspect-square w-full border-[0.5px] border-black/[0.12] group-hover:border-black/30 dark:border-white/[0.12] dark:group-hover:border-white/30"
        style={{ background: css, borderRadius: M.tileRadius }}
      />
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 border-2 border-[#007aff] dark:border-[#0a84ff]"
          style={{ borderRadius: M.tileRadius + 2.5 }}
        />
      )}
    </button>
  )
}

// 行：固定宽度标签列 + 内容

function FieldButton({
  children,
  onClick,
  active,
  title,
  className = ""
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`border-[0.5px] px-2 text-[11px] font-medium transition-colors ${
        active
          ? "border-[#007aff] text-[#007aff] dark:border-[#0a84ff] dark:text-[#0a84ff]"
          : "border-black/[0.08] bg-black/[0.035] text-black/[0.92] hover:bg-black/[0.07] dark:border-white/10 dark:bg-white/[0.055] dark:text-white/[0.92] dark:hover:bg-white/[0.09]"
      } ${className}`}
      style={{ height: M.controlHeight, borderRadius: M.fieldRadius }}>
      {children}
    </button>
  )
}

// 复选框（macOS 风格小方框 + 勾）
function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center border transition-colors ${
        checked
          ? "border-[#007aff] bg-[#007aff] dark:border-[#0a84ff] dark:bg-[#0a84ff]"
          : "border-black/25 hover:border-black/45 dark:border-white/30 dark:hover:border-white/55"
      }`}
      style={{ borderRadius: 3.5 }}>
      {checked && <CheckIcon className="h-2.5 w-2.5 text-white" />}
    </button>
  )
}

// 开关（macOS 风格 accent）
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-[30px] rounded-full transition-colors ${
        checked ? "bg-[#007aff] dark:bg-[#0a84ff]" : "bg-neutral-300 dark:bg-white/25"
      }`}>
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[14px]" : "left-[2px]"
        }`}
      />
    </button>
  )
}

// 3×3 对齐九宫格：44px 格，12px 圆点，6px 选中标记（仅垂直方向生效）
function AlignmentGrid({ value, onChange }: { value: string; onChange: (v: "top" | "center" | "bottom") => void }) {
  const rows: ("top" | "center" | "bottom")[] = ["top", "center", "bottom"]
  return (
    <div
      className="flex border-[0.5px] border-black/10 bg-black/[0.04] p-[2px] dark:border-white/10 dark:bg-white/[0.055]"
      style={{ borderRadius: M.sliderRadius }}>
      <div className="grid grid-cols-3">
        {rows.map((row) =>
          [0, 1, 2].map((col) => {
            const active = value === row && col === 1
            return (
              <button
                key={`${row}-${col}`}
                type="button"
                aria-label={row === "top" ? "顶部对齐" : row === "center" ? "居中" : "底部对齐"}
                onClick={() => onChange(row)}
                className="flex items-center justify-center"
                style={{ width: 44, height: 44 }}>
                <span
                  className={`flex items-center justify-center rounded-[3px] ${
                    active ? "bg-black/25 dark:bg-white/30" : "bg-black/[0.18] dark:bg-white/20"
                  }`}
                  style={{ width: 12, height: 12 }}>
                  {active && <span className="h-[6px] w-[6px] rounded-[2px] bg-black/[0.85] dark:bg-white/90" />}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---------- 配置大弹窗 ----------
export function CardConfigModal({
  input,
  config,
  content,
  onContentChange,
  presets,
  activePresetId,
  onChange,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onClose,
  onConfirm
}: {
  input: ShareCardInput
  config: CardConfig
  content: string
  onContentChange: (value: string) => void
  presets: CardPreset[]
  activePresetId: string | null
  onChange: (patch: Partial<CardConfig>) => void
  onApplyPreset: (preset: CardPreset) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (id: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const [bgTab, setBgTab] = useState<"solid" | "gradient" | "custom">(
    config.bgType === "solid" ? "solid" : config.bgType === "custom" ? "custom" : "gradient"
  )
  const [activeTab, setActiveTab] = useState<"style" | "content" | "watermark">("style")
  const [presetName, setPresetName] = useState("")
  const [naming, setNaming] = useState(false)
  const [planMeta, setPlanMeta] = useState<{ W: number; H: number; totalPages: number } | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const headerFileRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const configScrollRef = useRef<HTMLDivElement>(null)
  const namingRef = useRef<HTMLDivElement>(null)
  const domHostRef = useRef<HTMLDivElement>(null)
  const lastNodeRef = useRef<HTMLDivElement | null>(null)
  const previewAreaRef = useRef<HTMLDivElement>(null)
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 })

  // 预览宿主尺寸（用于把 W×H 的卡片缩放贴进预览区）。
  // clientWidth/Height 含 padding，需扣除，否则卡片会放大到 padding 区里贴边
  useEffect(() => {
    const el = previewAreaRef.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      setHostSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- 活 DOM 预览：rAF 对齐重建（每帧最多一次，60fps 跟手；单次重建仅 ~1ms） ----
  // 直接替换宿主内容，不把卡片塞进 React 树；也不在此路径转 planning（避免整弹窗重渲染）
  const domRafRef = useRef<number | null>(null)
  const domRunningRef = useRef(false)
  const domQueuedRef = useRef(false)
  const prevAlignRef = useRef<CardConfig["align"] | null>(null)
  const domLatestRef = useRef({ input, config, page: previewPage })
  domLatestRef.current = { input, config, page: previewPage }

  const runDomPreview = useCallback(async () => {
    const { input, config, page } = domLatestRef.current
    try {
      const { node, plan } = await buildLivePreviewNode(input, config, page)
      setPlanMeta((prev) =>
        prev && prev.W === plan.W && prev.H === plan.H && prev.totalPages === plan.pages.length
          ? prev
          : { W: plan.W, H: plan.H, totalPages: plan.pages.length }
      )
      // 执行期间参数又变了：本次结果不挂载，置排队标记由执行器补跑（直接丢弃会卡在旧状态）
      if (domLatestRef.current.input !== input || domLatestRef.current.config !== config || domLatestRef.current.page !== page) {
        domQueuedRef.current = true
        return
      }
      // 对齐方式变化时做 FLIP 位移过渡（拖边距/改比例等连续变化不打动画，保持跟手）
      const prevNode = lastNodeRef.current
      const alignChanged = prevAlignRef.current !== null && prevAlignRef.current !== config.align
      prevAlignRef.current = config.align
      const prevCard = prevNode?.querySelector<HTMLElement>("[data-x-dist-card]")
      const prevTop = prevCard ? Number.parseFloat(prevCard.style.top) : NaN

      lastNodeRef.current = node
      domHostRef.current?.replaceChildren(node)
      setPreviewError((prev) => (prev === null ? prev : null))

      if (alignChanged && Number.isFinite(prevTop)) {
        const newCard = node.querySelector<HTMLElement>("[data-x-dist-card]")
        const newTop = newCard ? Number.parseFloat(newCard.style.top) : NaN
        if (newCard && Number.isFinite(newTop) && Math.abs(newTop - prevTop) > 0.5) {
          newCard.style.transform = `translateY(${prevTop - newTop}px)`
          // 双 rAF：先绘制初始位移，再过渡回 0
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              newCard.style.transition = "transform 280ms cubic-bezier(0.25, 0.1, 0.25, 1)"
              newCard.style.transform = "translateY(0px)"
            })
          )
        }
      }
    } catch (e) {
      setPreviewError(String(e))
    }
  }, [])

  // 串行执行 + 排队合并：运行中只记一次「待跑」，结束后立刻补跑最新参数
  const scheduleDomPreview = useCallback(() => {
    if (domRunningRef.current) {
      domQueuedRef.current = true
      return
    }
    if (domRafRef.current !== null) return
    domRafRef.current = requestAnimationFrame(() => {
      domRafRef.current = null
      domRunningRef.current = true
      void runDomPreview().finally(() => {
        domRunningRef.current = false
        if (domQueuedRef.current) {
          domQueuedRef.current = false
          scheduleDomPreview()
        }
      })
    })
  }, [runDomPreview])

  useEffect(() => {
    scheduleDomPreview()
  }, [input, config, previewPage, scheduleDomPreview])

  // 卸载时取消挂起的帧
  useEffect(
    () => () => {
      if (domRafRef.current !== null) cancelAnimationFrame(domRafRef.current)
    },
    []
  )

  // 首次构建完成时宿主可能尚未渲染（planMeta/scale 就绪才出现），宿主出现后补挂
  useEffect(() => {
    if (domHostRef.current && lastNodeRef.current) {
      domHostRef.current.replaceChildren(lastNodeRef.current)
    }
  }, [planMeta, hostSize])

  // 弹窗打开期间禁掉后面页面（x.com 时间线）的滚轮滚动。
  // React 的 onWheel 是 passive 监听无法 preventDefault，必须用原生非 passive 监听；
  // 命中可滚动的配置列表时放行（列表自身 overscroll-behavior:contain 已阻断到页面的链式滚动）
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (configScrollRef.current?.contains(e.target as Node)) return
      e.preventDefault()
    }
    const els = [overlayRef.current, namingRef.current].filter(Boolean) as HTMLDivElement[]
    els.forEach((el) => el.addEventListener("wheel", onWheel, { passive: false }))
    return () => els.forEach((el) => el.removeEventListener("wheel", onWheel))
  }, [naming])

  // Esc 关闭（命名弹窗打开时优先关命名弹窗）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (naming) {
          setNaming(false)
          return
        }
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose, naming])

  const confirmNaming = () => {
    const name = presetName.trim()
    if (!name) return
    onSavePreset(name)
    setPresetName("")
    setNaming(false)
  }

  const wm = config.watermark
  const patchWatermark = (patch: Partial<CardConfig["watermark"]>) =>
    onChange({ watermark: { ...wm, ...patch } })
  const totalPages = planMeta?.totalPages ?? 1
  // 活 DOM 预览的缩放：把 W×H 的原尺寸卡片贴进预览区
  const previewScale =
    planMeta && hostSize.w > 0 && hostSize.h > 0
      ? Math.min(hostSize.w / planMeta.W, hostSize.h / planMeta.H)
      : 0

  const handleBgFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setBgTab("custom")
      onChange({ bgType: "custom", bgCustomDataUrl: String(reader.result) })
    }
    reader.readAsDataURL(file)
    event.target.value = ""
  }

  return (
    <>
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}>
      <div
        className="flex h-[min(860px,92vh)] w-[min(1080px,96vw)] overflow-hidden rounded-xl bg-white text-neutral-900 shadow-2xl dark:bg-[#282828] dark:text-neutral-100"
        onClick={(e) => e.stopPropagation()}>
        {/* 左：预览（活 DOM 实时预览） */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#f5f5f7] dark:bg-[#1e1e20]">
          <div className="flex h-[38px] shrink-0 items-center justify-between px-4 text-[11px] text-black/45 dark:text-white/45">
            <span className="flex items-center gap-1.5">实时预览</span>
            <span className="font-mono">
              {planMeta ? `${planMeta.W}×${planMeta.H}` : "—"} · {totalPages} 页
            </span>
          </div>
          <div
            ref={previewAreaRef}
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3"
            style={{
              transform: "translateZ(0)",
              ...(config.bgType === "none"
                ? {
                    backgroundImage:
                      "linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0,8px 8px"
                  }
                : undefined)
            }}>
            {planMeta && hostSize.w > 0 && hostSize.h > 0 ? (
              <div
                className="overflow-hidden rounded-md shadow-lg"
                style={{
                  width: planMeta.W * previewScale,
                  height: planMeta.H * previewScale
                }}>
                <div
                  ref={domHostRef}
                  style={{
                    width: planMeta.W,
                    height: planMeta.H,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "0 0"
                  }}
                />
              </div>
            ) : (
              !previewError && (
                <span className="text-[11px] text-black/35 dark:text-white/35">构建预览…</span>
              )
            )}
            {previewError && (
              <div className="max-w-[220px] px-4 text-center text-[11px] leading-5 text-red-500">
                预览渲染失败：{previewError}
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pb-4">
              <FieldButton
                onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                title="上一页">
                ‹ 上一页
              </FieldButton>
              <span className="font-mono text-[11px] text-black/45 dark:text-white/45">
                {previewPage + 1} / {totalPages}
              </span>
              <FieldButton
                onClick={() => setPreviewPage((p) => Math.min(totalPages - 1, p + 1))}
                title="下一页">
                下一页 ›
              </FieldButton>
            </div>
          )}
        </div>

        {/* 右：配置项（inspector 密度） */}
        <div className="flex w-[320px] shrink-0 flex-col border-l-[0.5px] border-black/10 dark:border-white/10">
          {/* 标题栏 */}
          <div className="flex h-[38px] shrink-0 items-center gap-1.5 border-b-[0.5px] border-black/10 px-3 dark:border-white/10">
            <span className="text-[13px] font-semibold">卡片配置</span>
            <span className="flex-1" />
            <IconButton
              title={activePresetId ? "回到所选预设" : "恢复默认配置"}
              onClick={() => {
                // 选中预设时重置回该预设；未选则恢复出厂默认
                const preset = presets.find((p) => p.id === activePresetId)
                if (preset) {
                  onApplyPreset(preset)
                } else {
                  onChange({ ...DEFAULT_CARD_CONFIG })
                }
              }}>
              <RefreshIcon className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="关闭" onClick={onClose}>
              <CloseIcon className="h-3.5 w-3.5" />
            </IconButton>
          </div>

            {/* 预设栏（tab 上方，所有 tab 通用） */}
            <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
              <select
                value={activePresetId ?? ""}
                onChange={(e) => {
                  const preset = presets.find((p) => p.id === e.target.value)
                  if (preset) onApplyPreset(preset)
                }}
                className="min-w-0 flex-1 border-[0.5px] border-black/[0.08] bg-black/[0.035] px-1.5 text-[11px] text-black/[0.92] outline-none dark:border-white/10 dark:bg-white/[0.055] dark:text-white/[0.92]"
                style={{ height: 28, borderRadius: M.fieldRadius }}>
                <option value="">未保存预设</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {activePresetId && (
                <IconButton title="删除该预设" onClick={() => onDeletePreset(activePresetId)}>
                  <TrashIcon className="h-3 w-3" />
                </IconButton>
              )}
              <IconButton
                title="保存当前配置为预设"
                onClick={() => {
                  setPresetName("")
                  setNaming(true)
                }}>
                <PlusIcon className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            <SectionDivider />

          {/* 顶部 tab：内容 / 样式 / 水印 */}
          <div className="px-3 pb-0 pt-1.5">
            <div
              className="flex border-[0.5px] border-black/10 bg-black/[0.04] p-[2px] dark:border-white/10 dark:bg-white/[0.055]"
              style={{ height: M.sliderHeight, borderRadius: M.sliderRadius }}>
              {(
                [
                  ["style", "样式"],
                  ["content", "内容"],
                  ["watermark", "水印"]
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 border-[0.5px] px-2 text-[11px] font-medium transition-colors ${
                    activeTab === key
                      ? "border-black/10 bg-black/[0.075] text-black/[0.92] dark:border-white/10 dark:bg-white/10 dark:text-white/[0.92]"
                      : "border-transparent text-black/45 hover:bg-black/[0.04] dark:text-white/45 dark:hover:bg-white/[0.04]"
                  }`}
                  style={{ borderRadius: M.sliderRadius - M.controlInset }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2" />

          <div
            ref={configScrollRef}
            className="flex-1 overflow-y-auto"
            style={{ transform: "translateZ(0)", overscrollBehavior: "contain" }}>
            {activeTab === "style" && (
              <>
            {/* 填充库 */}
            <Section
              title="填充库"
              accessory={
                config.bgType === "none" ? (
                  <span className="text-[10px] text-black/40 dark:text-white/40">已清除 · 透明导出</span>
                ) : (
                  <IconButton title="清除背景（透明导出）" onClick={() => onChange({ bgType: "none" })}>
                    <CloseIcon className="h-3 w-3" />
                  </IconButton>
                )
              }>
              <Segmented
                options={[
                  { key: "solid", label: "颜色" },
                  { key: "gradient", label: "渐变" },
                  { key: "custom", label: "壁纸" }
                ]}
                value={bgTab}
                onChange={(tab) => {
                  setBgTab(tab)
                  if (tab === "solid") onChange({ bgType: "solid" })
                  if (tab === "gradient") onChange({ bgType: "gradient" })
                  if (tab === "custom" && config.bgCustomDataUrl) onChange({ bgType: "custom" })
                }}
              />
              {bgTab === "solid" && (
                <div className="grid grid-cols-8 gap-[3px]">
                  {SOLID_PRESETS.map((p) => (
                    <Tile
                      key={p.id}
                      title={p.name}
                      css={p.css}
                      selected={config.bgType === "solid" && config.bgSolidId === p.id}
                      onClick={() => onChange({ bgType: "solid", bgSolidId: p.id })}
                    />
                  ))}
                </div>
              )}
              {bgTab === "gradient" && (
                <div className="grid grid-cols-8 gap-[3px]">
                  {GRADIENT_PRESETS.map((g) => (
                    <Tile
                      key={g.id}
                      title={g.name}
                      css={`linear-gradient(135deg, ${g.stops.join(", ")})`}
                      selected={config.bgType === "gradient" && config.bgGradientId === g.id}
                      onClick={() => onChange({ bgType: "gradient", bgGradientId: g.id })}
                    />
                  ))}
                </div>
              )}
              {bgTab === "custom" && (
                <div className="flex flex-col gap-1.5">
                  {config.bgCustomDataUrl && (
                    <button
                      type="button"
                      title="自定义壁纸（点击启用）"
                      onClick={() => onChange({ bgType: "custom" })}
                      className={`relative block w-full border-[1.5px] ${
                        config.bgType === "custom"
                          ? "border-[#007aff] dark:border-[#0a84ff]"
                          : "border-transparent"
                      }`}
                      style={{
                        aspectRatio: "16 / 9",
                        borderRadius: M.tileRadius,
                        background: `url(${JSON.stringify(config.bgCustomDataUrl)}) center / cover no-repeat`
                      }}
                    />
                  )}
                  <FieldButton
                    onClick={() => bgFileRef.current?.click()}
                    title="上传背景图"
                    className="w-full"
                    active={config.bgType === "custom" && !!config.bgCustomDataUrl}>
                    {config.bgCustomDataUrl ? "更换壁纸" : "上传壁纸"}
                  </FieldButton>
                </div>
              )}
            </Section>
            <SectionDivider />

            {/* 比例（卡片按钮：上为对应比例的矩形示意，下为名称） */}
            <Section title="比例">
              <div className="grid grid-cols-5 gap-1.5">
                {RATIO_PRESETS.map((r) => {
                  const active = config.ratio === r.key
                  const value = r.key === "auto" || r.key === "custom" ? null : RATIO_VALUE[r.key]
                  // 图标：最大边 18px 的同比例矩形；自动/自定义用虚线方框示意
                  let iw = 18
                  let ih = 18
                  if (value !== null) {
                    if (value >= 1) {
                      ih = 18
                      iw = Math.max(6, Math.round((18 / value) * 2) / 2)
                    } else {
                      iw = 18
                      ih = Math.max(6, Math.round(18 * value * 2) / 2)
                    }
                  }
                  const dashed = value === null
                  return (
                    <button
                      key={r.key}
                      type="button"
                      title={r.key === "auto" ? "高度随内容自适应" : r.key === "custom" ? "自定义宽高" : r.label}
                      onClick={() => onChange({ ratio: r.key })}
                      className={`flex flex-col items-center gap-1 border-[1px] pb-1 pt-1.5 transition-colors ${
                        active
                          ? "border-[#007aff] bg-[#007aff]/10 text-[#007aff] dark:border-[#0a84ff] dark:bg-[#0a84ff]/15 dark:text-[#0a84ff]"
                          : "border-black/[0.08] bg-black/[0.035] text-black/[0.7] hover:bg-black/[0.07] dark:border-white/10 dark:bg-white/[0.055] dark:text-white/[0.75] dark:hover:bg-white/[0.09]"
                      }`}
                      style={{ borderRadius: M.tileRadius }}>
                      <span className="flex h-[20px] items-center justify-center">
                        <span
                          style={{
                            width: iw,
                            height: ih,
                            border: `${dashed ? "1.5px dashed" : "1.5px solid"} currentColor`,
                            borderRadius: 2,
                            display: "block"
                          }}
                        />
                      </span>
                      <span className="text-[10px] font-medium leading-none">{r.label}</span>
                    </button>
                  )
                })}
              </div>
              {config.ratio === "custom" && (
                <div className="flex items-center gap-1.5 text-[11px] text-black/45 dark:text-white/45">
                  宽
                  <input
                    type="number"
                    min={320}
                    max={2560}
                    value={config.customW}
                    onChange={(e) => onChange({ customW: e.target.value })}
                    className="w-14 border-[0.5px] border-black/[0.08] bg-black/[0.035] px-1.5 text-center font-mono text-[11px] outline-none dark:border-white/10 dark:bg-white/[0.055]"
                    style={{ height: M.sliderHeight, borderRadius: M.sliderRadius }}
                  />
                  × 高
                  <input
                    type="number"
                    min={320}
                    max={6400}
                    value={config.customH}
                    onChange={(e) => onChange({ customH: e.target.value })}
                    className="w-14 border-[0.5px] border-black/[0.08] bg-black/[0.035] px-1.5 text-center font-mono text-[11px] outline-none dark:border-white/10 dark:bg-white/[0.055]"
                    style={{ height: M.sliderHeight, borderRadius: M.sliderRadius }}
                  />
                  px
                </div>
              )}
            </Section>
            <SectionDivider />

            {/* 布局（长度均为 1920 基准下的 px 值） */}
            <Section title="布局">
              <InspectorSlider
                title="外边距"
                value={config.outerPadding}
                min={0}
                max={460}
                step={2}
                multiplier={1}
                suffix=" px"
                fractionDigits={0}
                onChange={(v) => onChange({ outerPadding: v })}
              />
              <InspectorSlider
                title="内边距"
                value={config.paddingX}
                min={0}
                max={100}
                step={1}
                multiplier={1}
                suffix=" px"
                fractionDigits={0}
                onChange={(v) => onChange({ paddingX: v })}
              />
              <InspectorSlider
                title="阴影"
                value={config.shadow}
                min={0}
                max={1}
                step={0.02}
                multiplier={1}
                suffix=""
                fractionDigits={2}
                onChange={(v) => onChange({ shadow: v })}
              />
              <InspectorSlider
                title="圆角"
                value={config.cornerRadius}
                min={0}
                max={200}
                step={2}
                multiplier={1}
                suffix=" px"
                fractionDigits={0}
                onChange={(v) => onChange({ cornerRadius: v })}
              />
            </Section>
            <SectionDivider />

            {/* 内容大小 */}
            <Section title="内容大小">
              <InspectorSlider
                title="字号"
                value={config.textScale}
                min={0.75}
                max={1.5}
                step={0.05}
                multiplier={1}
                suffix="×"
                fractionDigits={2}
                onChange={(v) => onChange({ textScale: v })}
              />
            </Section>
            <SectionDivider />

            {/* 阴影样式 */}
            <Section title="阴影样式">
              <Segmented
                options={SHADOW_STYLES.map((s) => ({ key: s.key, label: s.name }))}
                value={config.shadowStyle}
                onChange={(key) => onChange({ shadowStyle: key })}
                disabled={config.shadow <= 0.01}
              />
            </Section>
            <SectionDivider />

            {/* 对齐 */}
            <Section title="对齐">
              <AlignmentGrid value={config.align} onChange={(v) => onChange({ align: v })} />
            </Section>
            <SectionDivider />


              </>
            )}

            {activeTab === "content" && (
              <>
            {/* 正文（直接在弹窗内编辑，右侧即时预览） */}
            <div className="px-3 pb-1 pt-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-black/85 dark:text-white/85">正文</span>
                <span className="flex-1" />
                <span className="text-[10px] tabular-nums text-black/35 dark:text-white/35">{content.length} 字</span>
              </div>
              <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                rows={4}
                placeholder="卡片正文，修改后右侧即时预览…"
                className="w-full resize-y border-[0.5px] border-black/[0.08] bg-black/[0.035] px-2 py-1.5 text-[11px] leading-5 outline-none focus:border-[#007aff] dark:border-white/10 dark:bg-white/[0.055] dark:focus:border-[#0a84ff]"
                style={{ borderRadius: M.fieldRadius }}
              />
            </div>
            <SectionDivider />
              </>
            )}

            {/* 互动数据（开关样式同折叠组；开启后可逐项配置显示与数量） */}
            {activeTab === "content" && (
              <DisclosureSection
                title="互动数据"
                accessory={<Switch checked={config.showMetrics} onChange={(v) => onChange({ showMetrics: v })} />}>
                {config.showMetrics && (
                  <div className="flex flex-col gap-2">
                    {(
                      [
                        ["replies", "回复", input.stats.replies],
                        ["retweets", "转发", input.stats.retweets],
                        ["likes", "点赞", input.stats.likes],
                        ["bookmarks", "收藏", input.stats.bookmarks],
                        ["views", "浏览量", input.stats.views]
                      ] as const
                    ).map(([key, label, def]) => {
                      const metric = config.metrics[key]
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <Checkbox
                            checked={metric.show}
                            onChange={(v) =>
                              onChange({ metrics: { ...config.metrics, [key]: { ...metric, show: v } } })
                            }
                          />
                          <span className="w-11 shrink-0 text-[11px] text-black/45 dark:text-white/45">{label}</span>
                          <input
                            type="text"
                            value={metric.value}
                            onChange={(e) =>
                              onChange({
                                metrics: { ...config.metrics, [key]: { ...metric, value: e.target.value } }
                              })
                            }
                            maxLength={12}
                            placeholder={`默认 ${def || "0"}`}
                            disabled={!metric.show}
                            className="min-w-0 flex-1 border-[0.5px] border-black/[0.08] bg-black/[0.035] px-1.5 font-mono text-[11px] outline-none focus:border-[#007aff] disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.055] dark:focus:border-[#0a84ff]"
                            style={{ height: M.controlHeight, borderRadius: M.fieldRadius }}
                          />
                        </div>
                      )
                    })}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={config.metrics.share}
                        onChange={(v) => onChange({ metrics: { ...config.metrics, share: v } })}
                      />
                      <span className="text-[11px] text-black/45 dark:text-white/45">分享图标（无数字）</span>
                    </div>
                  </div>
                )}
              </DisclosureSection>
            )}

            {/* 用户信息（头像/名称/ID 显隐 + 自定义覆盖，空值用推文真实数据） */}
            {activeTab === "content" && (
              <DisclosureSection title="用户信息">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={config.header.avatar}
                      onChange={(v) => onChange({ header: { ...config.header, avatar: v } })}
                    />
                    <span className="w-11 shrink-0 text-[11px] text-black/45 dark:text-white/45">头像</span>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                      {config.header.avatarCustomDataUrl && (
                        <>
                          <span
                            className="h-5 w-5 shrink-0 border-[0.5px] border-black/[0.12] dark:border-white/[0.12]"
                            style={{
                              borderRadius: "50%",
                              background: `url(${JSON.stringify(config.header.avatarCustomDataUrl)}) center / cover no-repeat`
                            }}
                          />
                          <FieldButton
                            onClick={() => onChange({ header: { ...config.header, avatarCustomDataUrl: null } })}>
                            清除
                          </FieldButton>
                        </>
                      )}
                      <FieldButton
                        onClick={() => headerFileRef.current?.click()}
                        active={!!config.header.avatarCustomDataUrl}>
                        {config.header.avatarCustomDataUrl ? "更换" : "自定义"}
                      </FieldButton>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={config.header.name}
                      onChange={(v) => onChange({ header: { ...config.header, name: v } })}
                    />
                    <span className="w-11 shrink-0 text-[11px] text-black/45 dark:text-white/45">名称</span>
                    <input
                      type="text"
                      value={config.header.nameCustom}
                      onChange={(e) => onChange({ header: { ...config.header, nameCustom: e.target.value } })}
                      maxLength={40}
                      placeholder={input.authorName || "默认名称"}
                      disabled={!config.header.name}
                      className="min-w-0 flex-1 border-[0.5px] border-black/[0.08] bg-black/[0.035] px-1.5 text-[11px] outline-none focus:border-[#007aff] disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.055] dark:focus:border-[#0a84ff]"
                      style={{ height: M.controlHeight, borderRadius: M.fieldRadius }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={config.header.handle}
                      onChange={(v) => onChange({ header: { ...config.header, handle: v } })}
                    />
                    <span className="w-11 shrink-0 text-[11px] text-black/45 dark:text-white/45">ID</span>
                    <input
                      type="text"
                      value={config.header.handleCustom}
                      onChange={(e) => onChange({ header: { ...config.header, handleCustom: e.target.value } })}
                      maxLength={40}
                      placeholder={input.authorHandle || "默认 ID"}
                      disabled={!config.header.handle}
                      className="min-w-0 flex-1 border-[0.5px] border-black/[0.08] bg-black/[0.035] px-1.5 text-[11px] outline-none focus:border-[#007aff] disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.055] dark:focus:border-[#0a84ff]"
                      style={{ height: M.controlHeight, borderRadius: M.fieldRadius }}
                    />
                  </div>
                </div>
              </DisclosureSection>
            )}

            {/* 媒体（推文图片/视频封面展示；缩略图点选去留） */}
            {activeTab === "content" && (
              <DisclosureSection
                title="媒体"
                accessory={
                  <Switch
                    checked={config.media.show}
                    onChange={(v) => onChange({ media: { ...config.media, show: v } })}
                  />
                }>
                {config.media.show && (
                  <Segmented
                    options={[
                      { key: "fixed", label: "固定 16:9" },
                      { key: "original", label: "原比例" }
                    ]}
                    value={config.media.aspect}
                    onChange={(key) => onChange({ media: { ...config.media, aspect: key } })}
                  />
                )}
                {config.media.show &&
                  (input.media && input.media.length > 0 ? (
                    <div className="grid grid-cols-4 gap-1.5">
                      {input.media.map((m) => {
                        const hidden = config.media.hiddenUrls.includes(m.url)
                        return (
                          <button
                            key={m.url}
                            type="button"
                            title={m.kind === "video" ? "视频封面" : "图片"}
                            onClick={() =>
                              onChange({
                                media: {
                                  ...config.media,
                                  hiddenUrls: hidden
                                    ? config.media.hiddenUrls.filter((u) => u !== m.url)
                                    : [...config.media.hiddenUrls, m.url]
                                }
                              })
                            }
                            className={`relative aspect-square overflow-hidden border-[1.5px] transition-opacity ${
                              hidden
                                ? "border-transparent opacity-35"
                                : "border-[#007aff] dark:border-[#0a84ff]"
                            }`}
                            style={{ borderRadius: M.tileRadius }}>
                            <img
                              src={m.thumbUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            {m.kind === "video" && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/45">
                                  <span className="ml-[2px] h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-white" />
                                </span>
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-[11px] text-black/35 dark:text-white/35">
                      这条推文没有图片或视频
                    </span>
                  ))}
              </DisclosureSection>
            )}

            {/* 水印（水印 tab） */}
            {activeTab === "watermark" && (
            <DisclosureSection
              title="水印"
              accessory={<Switch checked={wm.enabled} onChange={(v) => patchWatermark({ enabled: v })} />}>
              {wm.enabled && (
                <>
                  <input
                    type="text"
                    value={wm.text}
                    onChange={(e) => patchWatermark({ text: e.target.value })}
                    maxLength={40}
                    placeholder="水印文字，如 @你的账号"
                    className="w-full border-[0.5px] border-black/[0.08] bg-black/[0.035] px-2 text-[11px] outline-none focus:border-[#007aff] dark:border-white/10 dark:bg-white/[0.055] dark:focus:border-[#0a84ff]"
                    style={{ height: M.controlHeight, borderRadius: M.fieldRadius }}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        onClick={() => patchWatermark({ color: c })}
                        className={`h-5 w-5 border-[0.5px] ${
                          wm.color.toLowerCase() === c.toLowerCase()
                            ? "outline outline-2 outline-offset-1 outline-[#007aff] dark:outline-[#0a84ff]"
                            : "border-black/[0.12] dark:border-white/[0.12]"
                        }`}
                        style={{ background: c, borderRadius: 4 }}
                      />
                    ))}
                  </div>
                  <InspectorSlider
                    title="密度"
                    value={wm.density}
                    min={2}
                    max={10}
                    step={1}
                    multiplier={1}
                    suffix="×"
                    fractionDigits={0}
                    onChange={(v) => patchWatermark({ density: v })}
                  />
                  <InspectorSlider
                    title="字号"
                    value={wm.fontSize}
                    min={8}
                    max={160}
                    step={4}
                    multiplier={1}
                    suffix=" px"
                    fractionDigits={0}
                    onChange={(v) => patchWatermark({ fontSize: v })}
                  />
                  <InspectorSlider
                    title="角度"
                    value={wm.rotation}
                    min={-90}
                    max={90}
                    step={5}
                    multiplier={1}
                    suffix="°"
                    fractionDigits={0}
                    onChange={(v) => patchWatermark({ rotation: v })}
                  />
                  <InspectorSlider
                    title="不透明度"
                    value={wm.opacity}
                    min={0}
                    max={0.75}
                    step={0.03}
                    multiplier={1}
                    suffix=""
                    fractionDigits={2}
                    onChange={(v) => patchWatermark({ opacity: v })}
                  />
                </>
              )}
            </DisclosureSection>
            )}

          </div>
          {/* 确定（固定在配置列底部，不随内容滚动）：开启分享卡片并按当前配置生成图片传回 */}
          <div className="shrink-0 border-t-[0.5px] border-black/10 px-3 pb-3 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={onConfirm}
              className="flex w-full items-center justify-center gap-1.5 bg-[#007aff] text-[12px] font-semibold text-white transition-colors hover:bg-[#0066d6] dark:bg-[#0a84ff] dark:hover:bg-[#2071e0]"
              style={{ height: 34, borderRadius: M.fieldRadius + 1 }}>
              确定 · 生成分享卡片
            </button>
          </div>
        </div>

      </div>
    </div>

    {/* 保存预设：名称输入弹窗 */}
    {naming && (
      <div
        ref={namingRef}
        className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 p-4"
        onClick={() => setNaming(false)}>
        <div
          className="w-[280px] rounded-lg bg-white p-4 shadow-2xl dark:bg-[#282828]"
          onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 text-[12px] font-semibold text-black/85 dark:text-white/85">
            保存预设
          </div>
          <div className="mb-3 text-[11px] text-black/45 dark:text-white/45">
            仅保存用户名称/ID/头像与样式，不含互动数据
          </div>
          <input
            type="text"
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmNaming()
            }}
            maxLength={48}
            placeholder="预设名称"
            className="mb-3 w-full border-[0.5px] border-black/[0.1] bg-black/[0.035] px-2 text-[12px] outline-none focus:border-[#007aff] dark:border-white/10 dark:bg-white/[0.055] dark:focus:border-[#0a84ff]"
            style={{ height: 30, borderRadius: M.fieldRadius }}
          />
          <div className="flex justify-end gap-2">
            <FieldButton onClick={() => setNaming(false)}>取消</FieldButton>
            <FieldButton onClick={confirmNaming} active>
              保存
            </FieldButton>
          </div>
        </div>
      </div>
    )}

    {/* 隐藏 file input 必须在遮罩层（onClick=onClose）之外：
        input.click() 的编程式点击会冒泡，放在遮罩内会被当成点空白关闭弹窗 */}
    <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onClick={(e) => e.stopPropagation()} onChange={handleBgFile} />
    <input
      ref={headerFileRef}
      type="file"
      accept="image/*"
      className="hidden"
      onClick={(e) => e.stopPropagation()}
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => onChange({ header: { ...config.header, avatarCustomDataUrl: String(reader.result) } })
        reader.readAsDataURL(file)
        event.target.value = ""
      }}
    />
    </>
  )
}
