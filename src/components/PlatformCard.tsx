import { CheckIcon } from "./icons"

const ICON_STYLES: Record<string, { char: string; cls: string }> = {
  douyin: { char: "抖", cls: "bg-[#1f1f2e] text-white" },
  rednote: { char: "红", cls: "bg-[#ff2442] text-white" },
  okjike: { char: "即", cls: "bg-[#ffdc00] text-[#1f1f1f]" },
  weibo: { char: "微", cls: "bg-[#e6162d] text-white" }
}

export function PlatformIcon({ platformKey }: { platformKey: string }) {
  const style = ICON_STYLES[platformKey] ?? { char: "?", cls: "bg-neutral-500 text-white" }
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${style.cls}`}>
      {style.char}
    </div>
  )
}

export function PlatformCard({
  platformKey,
  name,
  selected,
  disabled,
  disabledReason,
  onToggle
}: {
  platformKey: string
  name: string
  selected: boolean
  disabled?: boolean
  disabledReason?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`relative flex w-full flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center transition-colors ${
        disabled
          ? "cursor-not-allowed border-neutral-200 opacity-40 dark:border-neutral-700"
          : selected
            ? "border-sky-500 bg-sky-50 dark:bg-sky-500/10"
            : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-500"
      }`}>
      <PlatformIcon platformKey={platformKey} />
      <span className="w-full truncate text-xs text-neutral-900 dark:text-neutral-100">{name}</span>
      {selected && !disabled && (
        <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-white">
          <CheckIcon className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  )
}
