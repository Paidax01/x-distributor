import { useEffect } from "react"
import type { TweetMediaItem } from "~extract/tweet"
import { CloseIcon } from "./icons"

// 媒体放大预览：点击空白处或 Esc 关闭；视频直接用远程 mp4 播放
export function MediaPreviewModal({
  item,
  onClose
}: {
  item: TweetMediaItem
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="relative flex max-h-[82vh] max-w-[90vw] items-center justify-center">
          {item.kind === "video" ? (
            <video
              src={item.url}
              controls
              autoPlay
              className="max-h-[82vh] max-w-[90vw] rounded-xl shadow-2xl"
            />
          ) : (
            <img
              src={item.url}
              alt={item.name}
              className="max-h-[82vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          )}
          <button
            type="button"
            aria-label="关闭预览"
            onClick={onClose}
            className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="text-center text-xs text-white/70">
          {item.name} · 点击空白处或按 Esc 关闭
        </div>
      </div>
    </div>
  )
}
