import type { PlatformInfo, PostMode, SyncData, SyncDataPlatform } from "./common"
import { DynamicDouyin } from "./adapters/douyin-dynamic"
import { VideoDouyin } from "./adapters/douyin-video"
import { DynamicRednote } from "./adapters/rednote-dynamic"
import { VideoRednote } from "./adapters/rednote-video"
import { DynamicOkjike } from "./adapters/okjike-dynamic"
import { VideoOkjike } from "./adapters/okjike-video"

export interface PlatformEntry {
  key: string // douyin / rednote / okjike
  name: string // 显示名
  homeUrl: string
  dynamic: PlatformInfo
  video: PlatformInfo
}

export const PLATFORMS: PlatformEntry[] = [
  {
    key: "douyin",
    name: "抖音",
    homeUrl: "https://creator.douyin.com",
    dynamic: {
      type: "DYNAMIC",
      name: "DYNAMIC_DOUYIN",
      platformKey: "douyin",
      platformName: "抖音",
      injectUrl: "https://creator.douyin.com/creator-micro/content/upload?default-tab=3",
      injectFunction: DynamicDouyin
    },
    video: {
      type: "VIDEO",
      name: "VIDEO_DOUYIN",
      platformKey: "douyin",
      platformName: "抖音",
      injectUrl: "https://creator.douyin.com/creator-micro/content/upload",
      injectFunction: VideoDouyin
    }
  },
  {
    key: "rednote",
    name: "小红书",
    homeUrl: "https://creator.xiaohongshu.com",
    dynamic: {
      type: "DYNAMIC",
      name: "DYNAMIC_REDNOTE",
      platformKey: "rednote",
      platformName: "小红书",
      injectUrl: "https://creator.xiaohongshu.com/publish/publish?target=image",
      injectFunction: DynamicRednote
    },
    video: {
      type: "VIDEO",
      name: "VIDEO_REDNOTE",
      platformKey: "rednote",
      platformName: "小红书",
      injectUrl: "https://creator.xiaohongshu.com/publish/publish?target=video",
      injectFunction: VideoRednote
    }
  },
  {
    key: "okjike",
    name: "即刻",
    homeUrl: "https://web.okjike.com",
    dynamic: {
      type: "DYNAMIC",
      name: "DYNAMIC_OKJIKE",
      platformKey: "okjike",
      platformName: "即刻",
      injectUrl: "https://web.okjike.com",
      injectFunction: DynamicOkjike
    },
    video: {
      type: "VIDEO",
      name: "VIDEO_OKJIKE",
      platformKey: "okjike",
      platformName: "即刻",
      injectUrl: "https://web.okjike.com",
      injectFunction: VideoOkjike
    }
  }
]

const infoMap: Record<string, PlatformInfo> = Object.fromEntries(
  PLATFORMS.flatMap((p) => [[p.dynamic.name, p.dynamic], [p.video.name, p.video]])
)

export function getInfoByName(name: string): PlatformInfo | null {
  return infoMap[name] ?? null
}

export function getPlatformEntry(key: string): PlatformEntry | undefined {
  return PLATFORMS.find((p) => p.key === key)
}

// 按发布模式（图文/视频）解析勾选平台对应的 PlatformInfo 名称
export function resolvePlatformNames(keys: string[], mode: PostMode): string[] {
  return keys
    .map((key) => {
      const entry = getPlatformEntry(key)
      if (!entry) return null
      return mode === "VIDEO" ? entry.video.name : entry.dynamic.name
    })
    .filter((name): name is string => name !== null)
}

// 为每个勾选平台打开发布页并注入自动化脚本
export async function createTabsForPlatforms(data: SyncData): Promise<{
  tabs: { tab: chrome.tabs.Tab; platformInfo: SyncDataPlatform }[]
  groupId?: number
}> {
  const tabs: { tab: chrome.tabs.Tab; platformInfo: SyncDataPlatform }[] = []
  let groupId: number | undefined

  for (const info of data.platforms) {
    const platformInfo = getInfoByName(info.name)
    if (!platformInfo) continue
    const injectUrl = info.injectUrl || platformInfo.injectUrl

    const tab = await chrome.tabs.create({ url: injectUrl })

    // 等待标签页加载完成（15 秒兜底超时，防止监听注册晚于加载完成而卡死）
    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        chrome.tabs.onUpdated.removeListener(listener)
        clearTimeout(safety)
        resolve()
      }
      const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (tabId === tab.id && changeInfo.status === "complete") finish()
      }
      const safety = setTimeout(finish, 15000)
      chrome.tabs.onUpdated.addListener(listener)
    })

    // 注入发布脚本
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: platformInfo.injectFunction,
      args: [data]
    })

    await chrome.tabs.update(tab.id!, { active: true })
    tabs.push({ tab, platformInfo: info })

    // 所有发布标签页归入一个分组
    try {
      if (!groupId) {
        groupId = await chrome.tabs.group({ tabIds: [tab.id!] })
        await chrome.tabGroups.update(groupId, {
          color: "blue",
          title: `X分发-${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
        })
      } else {
        await chrome.tabs.group({ tabIds: [tab.id!], groupId })
      }
    } catch (error) {
      console.warn("标签页分组失败（不影响发布）:", error)
    }

    // 平台间隔 3 秒，避免同时打开多个发布页造成卡顿
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  return { tabs, groupId }
}
