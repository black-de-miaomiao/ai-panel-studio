# 【DDD 阶段 · Prompt 04】设计驱动：演播厅视觉规范 → 组件 → 页面与状态流转（mock 事件驱动）

| 项 | 内容 |
|---|---|
| 范式 | DDD（Design-Driven Development，设计驱动开发）：先定视觉与交互规范，再按规范实现组件，最后组装页面；状态流转由 shared 契约中的 SSE 事件 + 纯 reducer 驱动 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`、`docs/PRD.md`（F1–F8 与响应式要求）、`docs/API.md`（类型与事件）、`shared/src` |
| 产出 | `docs/UI-DESIGN.md`、`web/src/**` |
| 约束 | 只改 `web/` 与新建 `docs/UI-DESIGN.md`；`shared/` 只允许做 §0 所述的 `LOBBY_GROUPS` 改动；不改 `server/`；不安装依赖；本阶段不接真实后端 |

> 为什么用 mock 事件剧本驱动：演播厅的沉浸感来自“状态如何随事件变化”。先用一份与真实 SSE 完全同构的事件剧本把 UI 和状态流转打磨好，下一阶段只需把事件源从剧本换成 EventSource，组件不用改。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md`、`docs/PRD.md`、`docs/API.md` 和 `shared/src` 全部文件。类型、事件、常量、中文标签都从 `@aps/shared` 导入，不要在 web 里重复定义。
- **开始编码前，先做唯一允许的 shared 改动**：把 `shared/src/constants.ts` 的 `LOBBY_GROUPS` 改为有稳定 key 的有序数组（代码见 `docs/prompts/03b-seed-review-fixes.md` 第 6 节），同步更新 `shared/src/constants.test.ts`，然后运行 `npm test -w @aps/shared` 确认通过。大厅 Tab 用 `key` 作为 `data-testid` 和查询参数（如 `?tab=replay`）。
- 并行：另外两个子代理正在 `server/` 下工作（TDD 失败用例、种子数据修订）。验证时只运行 web 工作区命令（`-w @aps/web`）和 `npm test -w @aps/shared`，不要运行根目录的 `npm test`。

## 1. 第一步：先写 `docs/UI-DESIGN.md`（写完再编码）

1. 设计理念：“深夜演播厅”——观众视角的电视圆桌直播。关键词：聚光、在播、字幕条、席位、实时。
2. 设计令牌：背景层级（`#05070D` 底 + 两束柔和径向聚光）；面板（深色玻璃：`rgba(255,255,255,0.04)` 底、1px `rgba(255,255,255,0.08)` 边、圆角 16px、backdrop-blur）；文字层级（主 `#E6E8EE` / 次 `#9AA3B2` / 弱 `#5C6575`）；强调色（LIVE 红 `#FF3B5C`、共识绿 `#3DDC97`、分歧橙 `#FF9F43`、主持金 `#E8C872`）；嘉宾专属色（来自 `HOST_COLOR` / `EXPERT_PALETTE`）；字体（中文系统字体栈，数字 tabular-nums）；字号阶梯；阴影与辉光；动效时长与曲线。
3. 布局与断点（ASCII 线框 + 尺寸）：
   - 全局：`h-dvh`，body 不滚动；每个区域 `min-h-0` + `overflow-auto`，在自身容器内独立滚动。
   - 超宽屏 ≥ 1600px：顶栏 + 三列 `[舞台与字幕 minmax(0,1fr)] [Transcript 420px] [共识与分歧 380px]`。
   - 桌面 1024–1599px：顶栏 + 两列 `[舞台与字幕（上）+ 共识与分歧（下，约 40% 高度）] [Transcript 380px]`。
   - 窄屏 < 1024px：紧凑顶栏 + 横向可滚动的嘉宾小窗条 + 字幕条 + Tab（实录 / 共识与分歧 / 总结）占满剩余高度，各 Tab 内容独立滚动。
   - 大厅页与新建页同样遵守“页面不整体滚动、区域内滚动”。
4. 组件清单：名称、职责、props、视觉状态。
5. 状态流转：两张 mermaid stateDiagram-v2（演播厅页面：加载中 → 待开播 → 直播中 ⇄ 已暂停 → 总结中 → 已结束；嘉宾小窗：待机 → 准备发言（带意图）→ 发言中 → 待机），以及“事件 → UI 变化”映射表（10 种事件逐一说明）。
6. 交互细节：字幕流式打字与光标；Transcript 自动跟随，用户上翻时显示“有新发言 ↓”；共识/分歧新增或更新时高亮 2 秒；发言者聚光；结束后总结面板；导出 Markdown。
7. 可访问性：对比度、字幕区 `aria-live="polite"`、键盘可达、`prefers-reduced-motion` 时关闭动画。

## 2. 第二步：实现（目录可微调，但要在报告里说明）

```text
web/src/
  styles/index.css        Tailwind v4 @theme 令牌；关键帧 live-pulse、speaking-glow、sound-wave、slide-in、flash
  lib/                    format.ts（时间、轮次）、color.ts（hex → rgba）、exportMarkdown.ts（把快照导出为 Markdown 实录的纯函数）
  state/
    discussionReducer.ts  纯函数 initState(snapshot)、reduce(state, event)，处理全部 10 种事件
    discussionReducer.test.ts
    eventSource.ts        事件源抽象 interface DiscussionEventSource { subscribe(onEvent, onStatus?): () => void }
    useDiscussion.ts      hook：snapshot + 事件源 → state；暴露连接状态（connecting / open / reconnecting）
  mocks/
    fixtures.ts           参考 seed 话题构造的快照：lineup_ready、live（中途、有人发言中）、ended（含 summary）
    mockScript.ts         一场完整的事件剧本（≥ 12 条发言），可调速
    mockEventSource.ts    按时间轴播放 mockScript 的事件源实现
    mockApi.ts            与后续真实 API 同签名的内存实现
  api/types.ts            DiscussionApi 接口（方法与 docs/API.md 一一对应），下一阶段补真实实现
  components/ui/          Button、IconButton、Badge、Panel、Avatar（彩色圆环 + 头像字）、Tabs、Skeleton、EmptyState、ConfirmDialog
  components/lobby/       DiscussionCard、LobbyGroupTabs
  components/lineup/      TopicForm（话题输入 + 示例话题 + 人数步进器 2–6）、GuestCard、HostCard、LineupReview、LineupSkeleton
  components/studio/      StudioHeader、StageArena、HostSeat、ExpertStatusWindow、OnAirCaption、TranscriptPanel、TranscriptItem、InsightsPanel、InsightItem、SummaryPanel、ConnectionBadge
  pages/                  LobbyPage、NewDiscussionPage、StudioPage
```

reducer 要求：`utterance.delta` 累积到 liveUtterance（不属于当前 liveUtterance 的 delta 忽略）；`utterance.completed` 按 seq 去重追加到 utterances 并清理对应 liveUtterance；`insights.updated` 整体替换；持久事件按 seq 去重（重连补发不产生重复）；中途加入时 snapshot 自带的 liveUtterance 要能继续累积。

mockScript 要求：participant.state（举手 / 抢答 / 补充 / 反驳 + focus）→ utterance.started → 多个 delta → utterance.completed → insights.updated（逐步增加共识 / 分歧，含一次分歧被化解）→ …… → discussion.status(summarizing) → 总结流式 → summary.completed → discussion.status(ended)。

路由：`/` 大厅；`/new` 新建；`/studio/:id` 演播厅；`/studio/demo` 用 mockScript 回放（设计验收与后续 E2E 对照用，正式版本也保留这个入口）。本阶段 `/` 与 `/new` 使用 mockApi。

## 3. 关键行为（验收点，必须做到）

- **大厅**：按 `LOBBY_GROUPS` 分组 Tab（直播中 / 待开播 / 往期回放，带数量）；卡片显示状态徽标（直播中为红色脉冲 LIVE）、话题（两行截断）、嘉宾头像串（专属色）、“第 n / max 轮”、观众数、最新一句发言摘要；“进入演播厅 / 观看回放”按钮；右上角“发起新讨论”。默认选中第一个非空分组；某个分组为空时显示空状态和“发起新讨论”入口。
- **新建页**：话题输入（2–200 字计数与校验提示）、示例话题、专家人数 2–6（默认 4）；点击生成 → 骨架屏 + “正在邀请嘉宾入场…”；阵容确认：主持人卡 + 专家卡（头像、姓名、职业 · Title、立场标签与立场陈述、专属色条）；操作“换一批”和“确认阵容，进入演播厅”；错误态可重试。
- **演播厅**：
  - 顶栏：返回、状态徽标、话题、轮次进度条、观众数、连接状态、控制按钮（待开播：开始直播；直播中：暂停 / 结束讨论；已暂停：继续 / 结束讨论；结束讨论需二次确认）。
  - 舞台：主持人席位（金色）+ 专家小窗。每个专家小窗独立显示头像与专属色、姓名、立场标签、职业 · Title、Agent 状态（待机 / 准备发言 / 发言中，用 `AGENT_STATE_LABELS`）、准备发言时的意图徽标（✋ 举手 / ⚡ 抢答 / ＋ 补充 / ⚔ 反驳，用 `INTENT_LABELS`）、“关注：{focus}”。发言中：专属色辉光 + 声波动画 + 轻微放大；准备发言：琥珀色呼吸边框；待机：降低不透明度。
  - 字幕条（OnAirCaption）：当前发言人色块 + 姓名 + Title + 流式文字与闪烁光标；空闲时显示“等待下一位发言…”。
  - Transcript：每条左侧 4px 专属色条 + 小头像 + 姓名（专属色）+ “职业 · Title” + 发言内容 + #seq；主持人条目用金色。只渲染 utterances（来自 `utterance.completed`），**不渲染举手 / 抢答等内部事件，也不显示意图标签**；新条目滑入；自动跟随与“有新发言 ↓”。
  - 共识与分歧：两个分区（窄屏在同一 Tab 内上下排列），带数量；共识条目显示内容 + 参与专家色点；分歧条目显示内容 + 各方立场（色点 + 姓名 + position）；resolved 显示“已化解”并弱化；新增 / 更新时高亮。
  - 总结：summarizing 时总结面板显示主持人流式文字；ended 时显示完整总结（按 `\n\n` 分段渲染成段落，**绝不 JSON.stringify，也不显示任何原始 JSON**）+ 最终共识 / 分歧计数 + “导出实录（Markdown）”按钮 + “返回大厅”。
- 所有文案为中文；颜色只来自令牌或嘉宾专属色。

## 4. 验证

1. `npm run typecheck -w @aps/web`；`npm test -w @aps/web`；`npm run build -w @aps/web`。
2. 截图验收（供编排者审查视觉效果）：已安装 `@playwright/test`，使用本机 Edge（`channel: 'msedge'`，不需要下载浏览器）。临时脚本放在仓库外：`C:\Users\123\Desktop\mianshiti\_review\ddd\shot.mjs`（不要放进仓库）。流程：后台启动 `npm run dev -w @aps/web`（端口 5173），依次截图到 `C:\Users\123\Desktop\mianshiti\_review\ddd\`：
   - `lobby-1440.png`（1440×900，大厅）
   - `new-lineup-1440.png`（阵容确认态）
   - `studio-demo-2560.png`（2560×1080，剧本播放到有人发言中且已有共识 / 分歧）
   - `studio-demo-1440.png`（1440×900，同上）
   - `studio-demo-390.png`（390×844，窄屏）
   - `studio-ended-1440.png`（总结完成态）
   每个视口断言 `document.documentElement.scrollHeight <= window.innerHeight + 1`（页面不整体滚动），结果写进报告。截图完成后按 PID 停止 dev server。
   提示：`/studio/demo` 可以支持查询参数（如 `?speed=8`、`?at=40`）快速播放到指定进度，方便截图。

## 5. 报告

`docs/UI-DESIGN.md` 章节目录；组件与页面清单；测试与构建结果；截图路径与“页面不滚动”断言结果；与规格的偏差；需要后端或契约配合的地方（不要自行修改 shared）。
