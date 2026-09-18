# X 一键分发（X Distributor）

一个 Chrome 扩展（Manifest V3）：在 x.com（Twitter）时间线每条帖子的操作栏加一个分发图标，点击弹出悬浮窗，把这条帖子一键分发到 **抖音 / 小红书 / 即刻**。自动识别图文帖与视频帖并切换对应的发布方式，还能把帖子排版成精美的分享卡片图片。

## 功能亮点

### 一键分发
- 每条帖子操作栏末尾自带分发图标，点击弹出悬浮窗
- 自动提取推文文本与图片（原图），**自动识别图文 / 视频帖**并可手动切换
- 视频帖自动解析出最高清的 mp4 直链；解析失败自动降级为「封面图 + 文字」的图文模式
- 标题、正文、媒体都可在悬浮窗内编辑，支持删除单张媒体
- 勾选目标平台 → 点击分发：自动打开各平台创作者发布页、填入内容、上传媒体，所有标签页归入同一分组
- 默认只填表单不发布，由你在各平台确认后手动点发布；也可以开启「自动发布」一步到位

### 分享卡片
把推文排版成一张适合小红书 / 抖音的精美图片（超长内容自动分成多张）：

- **实时预览**：配置弹窗左侧是所见即所得的预览，拖动任何滑杆即时刷新；右下角「确定 · 生成分享卡片」一键出图并加入待发布媒体
- **样式**：纯色 / 渐变 / 自定义壁纸背景（含透明底），外边距、内边距、圆角、阴影强度与四种阴影风格，卡片对齐方式（顶 / 中 / 底）
- **比例**：自动（随内容高度）、1:1 到 9:16 共七种预设、自定义宽高，卡片式选择器直观易认
- **内容**：显示推文图片 / 视频封面（可逐张挑选，支持固定 16:9 或原始比例）；互动数据逐项显隐、数量可自定义；用户头像 / 名称 / ID 可显隐并支持自定义覆盖
- **每帖记忆**：同一条帖子确认过的用户信息与互动数据会被记住，下次直接套用；没配置过的帖子使用真实数据
- **预设**：把整套样式保存为命名预设，随时一键应用；水印支持平铺文字（文字 / 颜色 / 密度 / 角度 / 透明度）
- 名称过长自动缩小字号避免裁切；深浅色主题自动跟随 x.com

## 安装

```bash
pnpm install
pnpm build        # 产物在 build/chrome-mv3-prod/
```

开发调试用 `pnpm dev`（产物在 `build/chrome-mv3-dev/`，改动自动重新加载）。

Chrome 打开 `chrome://extensions` → 打开右上角「开发者模式」→「加载已解压的扩展程序」→ 选择 `build/chrome-mv3-prod` 目录。

## 使用前置条件

- Chrome 中已登录 x.com
- 已登录 [抖音创作者平台](https://creator.douyin.com)、[小红书创作者中心](https://creator.xiaohongshu.com)、[即刻网页版](https://web.okjike.com)
- 访问 x.com / 推特图床需要网络可达（扩展内请求走浏览器网络，即系统代理）

## 使用说明

1. 打开 x.com 时间线，每条帖子操作栏末尾有一个分发图标（纸飞机）
2. 点击图标 → 右侧弹出悬浮窗，自动识别帖子类型并填好内容
3. 可选：打开「分享卡片」开关并点击「配置」，在弹窗中调整样式后点「确定 · 生成分享卡片」，卡片图片会加入媒体列表
4. 勾选要分发的平台（纯文字帖仅支持即刻）→ 点击「分发」
5. 各平台发布页自动打开并填好内容：默认由你确认后手动发布；开启自动发布则会自动点击发布按钮
6. 点击任意媒体缩略图可放大预览（卡片完整显示、视频可播放），Esc 或点击空白处关闭

## 工作原理

```
[x.com 页面] src/contents/x.tsx
  MutationObserver 监听虚拟列表 → 每条 article[data-testid="tweet"] 操作栏注入图标
  点击图标 → extractTweet() 提取文本/图片/视频检测/作者信息（src/extract/tweet.ts）
  → 悬浮窗（shadow DOM 隔离样式，React + Tailwind，src/components/DistributePanel.tsx）
  → 视频帖经 background 调 syndication 接口解析 mp4 直链（src/background/syndication.ts）
  → 分享卡片：Canvas 直绘（src/card/share-card.ts）或 DOM 排版 + foreignObject 光栅化
    （src/card/share-card-dom.ts，在扩展渲染窗口中执行），1920 宽基准、自动分页
        │ 点击「分发」
        ▼
[background] src/background/index.ts
  打开发布进度小窗 tabs/publish.html（MV3 service worker 无法 createObjectURL，
  由该扩展页把远程媒体 fetch 成 blob: URL —— src/tabs/publish.tsx）
        │ 媒体就绪后 X_DIST_PUBLISH_NOW
        ▼
[发布引擎] src/sync/platforms.ts :: createTabsForPlatforms
  逐平台：chrome.tabs.create(injectUrl) → 等加载完成
  → chrome.scripting.executeScript({func: injectFunction, args:[data]})
        ▼
[平台适配器] src/sync/adapters/（每平台图文/视频各一个，函数在平台页面内执行，必须自包含）
  waitForElement 等 DOM → DataTransfer 塞文件 → ClipboardEvent("paste") 填富文本
  → 按钮文本匹配点击「发布/发送」（仅在开启自动发布时）
```

## 已知限制

- **平台页面改版可能导致分发失效**：适配器依赖各平台创作者页的 DOM 结构，平台改版后需对照更新 `src/sync/adapters/` 中的选择器；x.com 改版则更新 `src/contents/x.tsx` 与 `src/extract/tweet.ts` 中的选择器
- **视频解析依赖推特公开 syndication 接口**（`cdn.syndication.twimg.com`），接口失效时自动降级为图文；GIF 帖按视频（mp4）处理
- 推文里的短链按页面显示文本提取；话题标签作为普通文本进入正文（各平台的话题组件需手动补）
- 登录态检测未实现：未登录的平台页会停在上传入口，需手动登录后重试
- 不涉及任何平台私有 API，全部为模拟人工操作的页面自动化；请自行遵守各平台使用条款
