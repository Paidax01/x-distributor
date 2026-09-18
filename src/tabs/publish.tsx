import "~style.css"
import { useEffect, useState } from "react"
import type { DynamicData, FileData, SyncData, VideoData } from "~sync/common"
import { AlertIcon, CheckIcon, SendIcon, SpinnerIcon } from "~components/icons"

type Step = "fetch" | "download" | "publishing" | "done" | "error"

const STEP_TEXT: Record<Step, string> = {
  fetch: "正在获取发布数据…",
  download: "正在下载媒体文件…",
  publishing: "正在打开各平台发布页并填充内容…",
  done: "发布页已就绪",
  error: "发布中断"
}

export default function Publish() {
  const [step, setStep] = useState<Step>("fetch")
  const [notice, setNotice] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [tabs, setTabs] = useState<
    Array<{ id?: number; title?: string; url?: string; favIconUrl?: string }>
  >([])
  const [summary, setSummary] = useState<string>("")

  useEffect(() => {
    let cancelled = false

    const processFile = async (file: FileData): Promise<FileData> => {
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`${file.name}: HTTP ${response.status}`)
      }
      const blob = await response.blob()
      return {
        ...file,
        url: URL.createObjectURL(blob),
        type: file.type || blob.type,
        size: blob.size
      }
    }

    const run = async () => {
      const response = await chrome.runtime.sendMessage({
        action: "X_DIST_PUBLISH_REQUEST_SYNC_DATA"
      })
      const data = response?.syncData as SyncData | undefined
      if (cancelled) return
      if (!data) {
        setErrors(["未获取到发布数据，请从 x.com 帖子上的分发按钮重新发起"])
        setStep("error")
        return
      }

      const inner = data.data as Partial<DynamicData & VideoData>
      setSummary(inner.title || inner.content?.slice(0, 40) || "")

      // 下载媒体并转为 blob URL（扩展页有 host_permissions，可绕过 CORS；
      // 注入函数在平台页内 fetch blob URL 完成上传）
      const processed = { ...data, data: { ...inner } } as SyncData
      try {
        if (Array.isArray(inner.images) && inner.images.length > 0) {
          setStep("download")
          const images: FileData[] = []
          for (const image of inner.images) {
            images.push(await processFile(image))
          }
          ;(processed.data as DynamicData).images = images
        }
        if (inner.video?.url) {
          setStep("download")
          const video = inner.video as FileData
          const blobbed = await processFile(video)
          ;(processed.data as VideoData).video = blobbed
        }
      } catch (error) {
        setErrors((prev) => [...prev, `媒体下载失败：${String(error)}`])
      }
      if (cancelled) return

      setStep("publishing")
      await new Promise((resolve) => setTimeout(resolve, 800))
      if (cancelled) return

      const publishResponse = await chrome.runtime.sendMessage({
        action: "X_DIST_PUBLISH_NOW",
        data: processed
      })
      if (cancelled) return

      if (publishResponse?.error) {
        setErrors((prev) => [...prev, publishResponse.error])
        setStep("error")
        return
      }

      setTabs(
        (publishResponse?.tabs ?? []).map(
          (t: { tab?: chrome.tabs.Tab }) => t.tab ?? t
        )
      )
      setStep("done")
    }

    run().catch((error) => {
      if (cancelled) return
      setErrors((prev) => [...prev, String(error)])
      setStep("error")
    })

    return () => {
      cancelled = true
    }
  }, [])

  const isError = step === "error"
  const isDone = step === "done"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 text-neutral-900">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isError
                ? "bg-red-100 text-red-500"
                : isDone
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-sky-100 text-sky-500"
            }`}>
            {isError ? (
              <AlertIcon className="h-6 w-6" />
            ) : isDone ? (
              <CheckIcon className="h-6 w-6" />
            ) : (
              <SpinnerIcon className="h-6 w-6" />
            )}
          </div>
          <h1 className="text-lg font-semibold">
            {isDone ? "发布页已打开" : isError ? "出错了" : "正在分发"}
          </h1>
          <p className="text-sm text-neutral-500">{STEP_TEXT[step]}</p>
          {summary && <p className="w-full truncate text-center text-xs text-neutral-400">{summary}</p>}
        </div>

        {!isDone && !isError && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
          </div>
        )}

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-600">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}

        {tabs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-neutral-500">
              已打开 {tabs.length} 个发布页（已归入同一标签组），点击可切换：
            </div>
            <ul className="space-y-2">
              {tabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => tab.id && chrome.tabs.update(tab.id, { active: true })}
                    className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-sky-300">
                    {tab.favIconUrl && (
                      <img src={tab.favIconUrl} alt="" className="h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{tab.title || tab.url}</span>
                    <SendIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isDone && (
          <div className="rounded-xl bg-neutral-100 p-3 text-xs leading-5 text-neutral-500">
            请到各平台标签页确认内容；若未开启「自动点击发布」，需要你手动点击发布按钮。
            媒体上传依赖本窗口，发布完成前请勿关闭它。
          </div>
        )}

        {(isDone || isError) && (
          <button
            type="button"
            onClick={() => window.close()}
            className="w-full rounded-full bg-sky-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-600">
            完成
          </button>
        )}
      </div>
    </div>
  )
}
