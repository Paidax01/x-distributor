import type { TweetMediaItem } from "~extract/tweet"
import { TrashIcon, VideoIcon } from "./icons"

export function MediaList({
  items,
  onRemove,
  onPreview
}: {
  items: TweetMediaItem[]
  onRemove: (index: number) => void
  onPreview: (item: TweetMediaItem) => void
}) {
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item, index) => (
        <div
          key={`${item.url}-${index}`}
          role="button"
          tabIndex={0}
          title={`预览 ${item.name}`}
          onClick={() => onPreview(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onPreview(item)
          }}
          className={`group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-90 ${
            item.kind === "image" && item.label
              ? "bg-neutral-100 dark:bg-neutral-700"
              : "bg-neutral-200 dark:bg-neutral-700"
          }`}>
          {/* 卡片等长图用 contain 完整显示，照片用 cover 铺满 */}
          <img
            src={item.thumbUrl}
            alt={item.name}
            loading="lazy"
            className={`h-full w-full ${
              item.kind === "image" && item.label ? "object-contain" : "object-cover"
            }`}
          />
          {item.kind === "video" && (
            <>
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-white">
                <VideoIcon className="h-5 w-5 drop-shadow" />
                <span className="rounded bg-black/60 px-1 text-[10px] leading-4">视频</span>
              </div>
            </>
          )}
          {item.kind === "image" && item.label && (
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">
              {item.label}
            </span>
          )}
          <button
            type="button"
            aria-label="删除"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(index)
            }}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <TrashIcon className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
