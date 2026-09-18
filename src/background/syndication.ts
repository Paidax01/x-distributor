// 通过推特公开的 syndication 接口解析推文媒体（与 vercel/react-tweet 同款实现）
// 该接口无需登录；service worker 持有 host_permissions，可跨域 fetch
import { syndicationToMedia, type SyndicationMedia, type TweetMediaResult } from "~extract/tweet"

// react-tweet 的 token 算法：由推文 ID 推导
// https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/fetch-tweet.ts
function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, "")
}

const FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on"
].join(";")

interface SyndicationResponse {
  id_str?: string
  mediaDetails?: SyndicationMedia[]
}

export async function fetchTweetMedia(tweetId: string): Promise<TweetMediaResult> {
  const url = new URL("https://cdn.syndication.twimg.com/tweet-result")
  url.searchParams.set("id", tweetId)
  url.searchParams.set("lang", "en")
  url.searchParams.set("token", getToken(tweetId))
  url.searchParams.set("features", FEATURES)

  try {
    const response = await fetch(url.toString(), { credentials: "omit" })
    if (!response.ok) {
      return {
        ok: false,
        error: `syndication 接口返回 ${response.status}`,
        images: [],
        video: null,
        videoPoster: null
      }
    }
    const data = (await response.json()) as SyndicationResponse
    const media = syndicationToMedia(data.mediaDetails ?? [])
    return { ok: true, ...media }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      images: [],
      video: null,
      videoPoster: null
    }
  }
}
