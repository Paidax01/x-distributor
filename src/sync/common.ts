// 发布数据结构与平台注入流程

export interface FileData {
  name: string
  url: string
  type?: string
  size?: number
}

export interface DynamicData {
  title: string
  content: string
  images: FileData[]
  videos: FileData[]
  tags?: string[]
}

export interface VideoData {
  title: string
  content: string
  video: FileData
  tags?: string[]
  cover?: FileData
}

export type PostMode = "DYNAMIC" | "VIDEO"

export interface SyncData {
  platforms: SyncDataPlatform[]
  isAutoPublish: boolean
  data: DynamicData | VideoData
}

export interface SyncDataPlatform {
  name: string
  injectUrl?: string
}

export interface PlatformInfo {
  type: "DYNAMIC" | "VIDEO"
  name: string // 全局唯一，如 DYNAMIC_DOUYIN
  platformKey: string // douyin / rednote / okjike
  platformName: string
  injectUrl: string
  injectFunction: (data: SyncData) => Promise<void>
}
