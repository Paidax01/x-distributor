import { CheckIcon } from "./icons"

const ICON_STYLES: Record<string, { char: string; cls: string }> = {
  douyin: { char: "抖", cls: "bg-[#1f1f2e] text-white" },
  rednote: { char: "红", cls: "bg-[#ff2442] text-white" },
  okjike: { char: "即", cls: "bg-[#ffdc00] text-[#1f1f1f]" }
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
      className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed border-neutral-200 opacity-40 dark:border-neutral-700"
          : selected
            ? "border-sky-500 bg-sky-50 dark:bg-sky-500/10"
            : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-500"
      }`}>
      <PlatformIcon platformKey={platformKey} />
      <span className="flex-1 text-sm text-neutral-900 dark:text-neutral-100">{name}</span>
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
          selected && !disabled ? "border-sky-500 bg-sky-500 text-white" : "border-neutral-300 dark:border-neutral-500"
        }`}>
        {selected && !disabled && <CheckIcon className="h-3 w-3" />}
      </span>
    </button>
  )
}
