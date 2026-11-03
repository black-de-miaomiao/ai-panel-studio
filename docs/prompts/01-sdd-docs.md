# 【SDD 阶段 · Prompt 01】需求规格化：PRD、ER 图、API 契约与架构设计

| 项 | 内容 |
|---|---|
| 范式 | SDD（Spec-Driven Development，规格驱动开发） |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 产出 | `docs/PRD.md`、`docs/ER.md`、`docs/API.md`、`docs/ARCHITECTURE.md` |
| 约束 | 只写文档，不写代码；不得改变第 2 节已确定的设计语义 |

> 为什么先写规格：后续每个编码阶段都由新的子代理执行，它们没有本次对话的记忆，只能读仓库里的文档。把需求理解和设计决策固化成精确的文档，可以避免上下文漂移和模型“自由发挥”（幻觉）。

## 0. 开始前

1. 仓库根目录：`C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先完整阅读根目录的 `AGENTS.md`。
2. 另一个子代理正在并行搭建脚手架（根 package.json、shared/、server/、web/）。**你只能创建第 3 节列出的 4 个文件**，不要创建或修改其他任何文件，不要运行 npm。
3. 不要读取 `server/.env`。

## 1. 业务需求（作业原文要点，PRD 必须完整覆盖）

### 1.1 产品定位

「AI Panel Studio」是一款“AI 圆桌讨论”本地 Web 应用：用户输入任意讨论话题并指定参会专家人数（默认 4 人），系统调用大模型动态生成一组主持人与专家嘉宾，展示每位嘉宾的姓名、职业、Title、立场与专属颜色标识；用户确认阵容后进入演播厅讨论模式，观看一场由 AI 驱动、实时推进的圆桌讨论。

核心价值主张：让任何人都能瞬间召集一支“虚拟智库”，围绕任意议题展开深度碰撞——主持人负责开场、追问、串联与收尾，专家之间自主“举手/抢答/补充/反驳”，讨论过程中持续生成共识与分歧，最终呈现一场沉浸式的 AI 圆桌实况。

### 1.2 目标用户

| 用户群体 | 特征描述 | 核心诉求 |
|---|---|---|
| 知识工作者与研究人员 | 需要快速对一个议题进行多角度审视，时间有限 | 在几分钟内获得来自不同视角的深度分析与争辩摘要 |
| 产品/决策人员 | 在方案评审或战略讨论前希望预演各方立场与潜在争议 | 用 AI 圆桌发现盲点、检验假设，提升决策质量 |
| 教育与内容创作者 | 需要将复杂议题结构化呈现给受众，追求沉浸感与叙事性 | 获得一场可录制、可回放的“虚拟专家访谈”作为内容素材 |

### 1.3 用户痛点

1. 视角单一：单一 AI 对话的分析往往立场单一，缺乏真实辩论中“对抗性思考”带来的深度。
2. 异步割裂：多次单独询问不同角色的 AI，上下文割裂，观点之间无法真正产生互动与碰撞。
3. 过程不可见：AI 输出通常以最终结论呈现，缺乏“思考过程”和“观点演化”的实时感与沉浸感。
4. 议题管理混乱：用户希望同时探索多个议题，但不同讨论的上下文、进展与结论难以并行隔离管理。

### 1.4 功能要求

- 首页：展示当前所有正在进行的讨论列表；用户可加入观察已有讨论，也可发起新讨论。
- 嘉宾生成：用户输入话题与专家人数后，系统调用大模型动态生成主持人 + 专家阵容，展示姓名、职业/Title、立场、专属颜色标识，由用户确认后进入演播厅。
- 演播厅模式：主持人负责开场、追问、串联和总结；专家根据当前 transcript 自主决定发言顺序（举手/抢答/补充/反驳），每次发言控制在 1–2 句；不允许机械式轮流发言。
- 专家状态小窗：每位专家有独立小窗，实时显示 Agent 运行状态（待机/准备发言/发言中）、当前关注点或公开思考摘要；不展示真实的隐藏 chain-of-thought。
- 实时共识与分歧：讨论过程中持续从发言中提炼共识与分歧，实时更新对应区域，不等到讨论结束后才生成。
- 现场 Transcript：显示发言人姓名与职业/Title，用与专家一致的色块区分；不显示“举手”等内部事件。
- 总结：结束时主持人以自然语言进行总结，禁止将 JSON 原文显示到页面上。

### 1.5 技术要求

- 可本地运行的前后端分离项目；大模型 API Key 只能放在后端从环境变量读取，不得暴露到浏览器端。
- 支持多个讨论并行：不同讨论的状态、事件流、transcript、共识与分歧必须互相隔离。
- 实时更新使用 SSE。
- 页面为中文 UI，做响应式布局：不依赖整个页面滚动，各区域在自身容器内独立滚动；超宽屏、普通桌面与窄屏均需合理分配区域。
- 数据库采用 SQLite。

## 2. 已确定的设计决策（写进文档时不得改变语义，可以补充细节、解释和示例）

### 2.1 技术栈与工程结构

- npm workspaces monorepo：`shared/`（@aps/shared，契约类型与 zod schema）、`server/`（@aps/server）、`web/`（@aps/web）、`e2e/`（Playwright）。
- 后端：Node.js ≥ 22.13 + TypeScript + Express 5 + zod + `node:sqlite`（DatabaseSync，零原生编译依赖）+ SSE。默认端口 8787。
- 前端：React 19 + Vite + TypeScript + Tailwind CSS v4 + React Router 7 + lucide-react；开发端口 5173，`/api` 由 Vite 代理到后端（浏览器与后端同源，无需 CORS）。
- 测试：Vitest（单元/集成）+ supertest + Playwright（E2E，使用 mock 大模型保证确定性）。
- 大模型：DeepSeek（OpenAI 兼容 Chat Completions，支持 `stream` 与 `response_format: {"type":"json_object"}`）。可用模型：`deepseek-v4-pro`（质量档，实测约 8 秒/次，带推理）与 `deepseek-flash`（速度档，实测约 1.5 秒/次，带推理）。两者都会返回 `reasoning_content`（隐藏思维链），后端必须丢弃。另有内置 `mock` 提供商：确定性输出，用于测试、E2E 与无 Key 演示。

### 2.2 状态机

讨论状态 `Discussion.status`：

| 状态 | 含义 | 首页分组 |
|---|---|---|
| `draft` | 已创建，阵容生成中 | 待开播 |
| `lineup_ready` | 阵容已生成，等待用户确认 | 待开播 |
| `live` | 直播中，引擎运行 | 直播中 |
| `paused` | 已暂停（服务重启时 live/summarizing 自动变为 paused） | 直播中（标“已暂停”） |
| `summarizing` | 主持人总结中 | 直播中 |
| `ended` | 已结束，可回看 | 往期回放 |
| `failed` | 阵容生成失败，可重新生成 | 待开播 |

合法转换：draft→lineup_ready（生成成功）；draft→failed（生成失败）；failed→lineup_ready（重新生成成功）；lineup_ready→lineup_ready（换一批）；lineup_ready→live（start）；live→paused（pause）；paused→live（resume）；live/paused→summarizing（end，或正文发言数达到 maxTurns）；summarizing→ended（总结完成）；服务启动时 live/summarizing→paused。其他转换一律返回 409 `INVALID_STATE`。

嘉宾 Agent 状态 `Participant.agentState`：`idle` 待机 / `preparing` 准备发言 / `speaking` 发言中。准备发言时附带 `agentIntent`：`raise_hand` 举手 / `interrupt` 抢答 / `supplement` 补充 / `rebut` 反驳；其余时候为 null。

发言类型 `Utterance.act`：主持人 `opening` 开场 / `follow_up` 追问 / `bridge` 串联 / `invite` 点名邀请 / `closing` 总结；专家 `statement` 陈述（来自举手）/ `interrupt` 抢答 / `supplement` 补充 / `rebut` 反驳。

### 2.3 数据模型（SQLite，列名 snake_case，时间均为 ISO 8601 字符串，id 为 UUID）

**discussions**

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| topic | TEXT | NOT NULL | 话题，修剪后 2–200 字 |
| expert_count | INTEGER | NOT NULL, CHECK 2–6 | 专家人数（不含主持人），默认 4 |
| status | TEXT | NOT NULL, CHECK 枚举 | 见 2.2 |
| max_turns | INTEGER | NOT NULL DEFAULT 16 | 正文发言上限（不含开场与总结） |
| turn_count | INTEGER | NOT NULL DEFAULT 0 | 已完成的正文发言数（含主持人插话） |
| summary | TEXT | NULL | 主持人自然语言总结 |
| error_message | TEXT | NULL | 最近一次错误（中文，可展示） |
| source | TEXT | NOT NULL DEFAULT 'user', CHECK in ('user','seed') | 数据来源 |
| created_at / updated_at | TEXT | NOT NULL | |
| started_at / ended_at | TEXT | NULL | 首次开播 / 结束时间 |

**participants**（主持人与专家都在此表）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | |
| discussion_id | TEXT | NOT NULL, FK→discussions ON DELETE CASCADE | |
| role | TEXT | NOT NULL, CHECK in ('host','expert') | |
| seat | INTEGER | NOT NULL, UNIQUE(discussion_id, seat) | 主持人 0，专家 1..N |
| name | TEXT | NOT NULL | 虚构姓名 ≤12 字 |
| profession | TEXT | NOT NULL | 职业 ≤20 字 |
| title | TEXT | NOT NULL | 头衔/Title ≤30 字 |
| stance | TEXT | NOT NULL | 立场陈述 ≤80 字（主持人为主持风格） |
| stance_tag | TEXT | NOT NULL | 立场短标签 ≤6 字（如 支持/反对/中立/谨慎乐观） |
| persona | TEXT | NOT NULL DEFAULT '' | 背景与说话风格 ≤200 字 |
| color | TEXT | NOT NULL | 专属颜色 #RRGGBB，由代码分配 |
| avatar | TEXT | NOT NULL | 头像字（姓名首字） |
| agent_state | TEXT | NOT NULL DEFAULT 'idle', CHECK 枚举 | |
| agent_intent | TEXT | NULL, CHECK 枚举 | |
| focus | TEXT | NULL | 当前关注点/公开思考摘要 ≤40 字 |
| speak_count | INTEGER | NOT NULL DEFAULT 0 | 已发言次数 |
| created_at | TEXT | NOT NULL | |

**utterances**（现场 Transcript）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | |
| discussion_id | TEXT | NOT NULL, FK CASCADE | |
| participant_id | TEXT | NOT NULL, FK→participants ON DELETE CASCADE | 发言人 |
| seq | INTEGER | NOT NULL, UNIQUE(discussion_id, seq) | 讨论内从 1 递增 |
| act | TEXT | NOT NULL, CHECK 枚举 | 见 2.2 |
| reply_to_participant_id | TEXT | NULL, FK→participants ON DELETE SET NULL | 回应对象 |
| content | TEXT | NOT NULL | 发言内容 |
| created_at | TEXT | NOT NULL | |

**insights**（共识与分歧）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | |
| discussion_id | TEXT | NOT NULL, FK CASCADE | |
| kind | TEXT | NOT NULL, CHECK in ('consensus','divergence') | |
| content | TEXT | NOT NULL | ≤80 字 |
| status | TEXT | NOT NULL DEFAULT 'active', CHECK in ('active','resolved') | 分歧化解后为 resolved |
| evidence_seqs | TEXT | NOT NULL DEFAULT '[]' | JSON 数组：支撑该条的发言 seq |
| updated_at_seq | INTEGER | NOT NULL | 最近一次更新对应的发言 seq |
| created_at / updated_at | TEXT | NOT NULL | |

**insight_stances**（某条共识/分歧上各专家的立场）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| insight_id | TEXT | NOT NULL, FK→insights ON DELETE CASCADE | |
| participant_id | TEXT | NOT NULL, FK→participants ON DELETE CASCADE | |
| position | TEXT | NOT NULL | 立场简述 ≤40 字（共识可为“认同”） |
| — | — | PK(insight_id, participant_id) | |

**events**（持久事件日志：SSE 断线补发与回放）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| discussion_id | TEXT | NOT NULL, FK CASCADE | |
| seq | INTEGER | NOT NULL | 讨论内从 1 递增 |
| type | TEXT | NOT NULL | 持久事件类型 |
| payload | TEXT | NOT NULL | 事件 JSON（与 SSE data 完全相同） |
| created_at | TEXT | NOT NULL | |
| — | — | PK(discussion_id, seq) | |

索引：`idx_insights_discussion(discussion_id, kind)`、`idx_discussions_status(status, updated_at)`（其余由唯一约束覆盖）。连接参数：`PRAGMA foreign_keys=ON; journal_mode=WAL; busy_timeout=5000`。

### 2.4 API 领域类型（camelCase，由 shared 包导出）

```ts
type DiscussionStatus = 'draft' | 'lineup_ready' | 'live' | 'paused' | 'summarizing' | 'ended' | 'failed';
type AgentState = 'idle' | 'preparing' | 'speaking';
type BidIntent = 'raise_hand' | 'interrupt' | 'supplement' | 'rebut';
type SpeechAct = 'opening' | 'follow_up' | 'bridge' | 'invite' | 'closing' | 'statement' | 'interrupt' | 'supplement' | 'rebut';
type InsightKind = 'consensus' | 'divergence';
type InsightStatus = 'active' | 'resolved';

interface Discussion { id: string; topic: string; expertCount: number; status: DiscussionStatus; maxTurns: number; turnCount: number; summary: string | null; errorMessage: string | null; source: 'user' | 'seed'; createdAt: string; updatedAt: string; startedAt: string | null; endedAt: string | null }
interface Participant { id: string; discussionId: string; role: 'host' | 'expert'; seat: number; name: string; profession: string; title: string; stance: string; stanceTag: string; persona: string; color: string; avatar: string; agentState: AgentState; agentIntent: BidIntent | null; focus: string | null; speakCount: number }
interface Utterance { id: string; discussionId: string; participantId: string; seq: number; act: SpeechAct; replyToParticipantId: string | null; content: string; createdAt: string }
interface InsightStance { participantId: string; position: string }
interface Insight { id: string; discussionId: string; kind: InsightKind; content: string; status: InsightStatus; stances: InsightStance[]; evidenceSeqs: number[]; updatedAtSeq: number; createdAt: string; updatedAt: string }
interface LiveUtterance { utteranceId: string; participantId: string; act: SpeechAct; replyToParticipantId: string | null; seq: number; text: string }
interface DiscussionSnapshot { discussion: Discussion; participants: Participant[]; utterances: Utterance[]; insights: Insight[]; liveUtterance: LiveUtterance | null; lastEventSeq: number; viewerCount: number }
interface ParticipantBrief { id: string; role: 'host' | 'expert'; name: string; title: string; color: string; avatar: string }
interface DiscussionListItem { id: string; topic: string; status: DiscussionStatus; expertCount: number; maxTurns: number; turnCount: number; source: 'user' | 'seed'; createdAt: string; updatedAt: string; participants: ParticipantBrief[]; utteranceCount: number; viewerCount: number; latestUtterance: { speakerName: string; content: string } | null }
```

`liveUtterance`：正在流式输出的发言（内存态），让中途加入的观众也能看到当前字幕；没有则为 null。

### 2.5 REST API（前缀 `/api`，JSON）

错误格式统一：`{ "error": { "code": "VALIDATION_ERROR", "message": "话题长度需在 2–200 字之间", "details": [] } }`。错误码：`VALIDATION_ERROR` 400、`NOT_FOUND` 404、`INVALID_STATE` 409、`LLM_ERROR` 502、`INTERNAL` 500。message 一律中文、可直接展示，不含堆栈。

| 方法 | 路径 | 说明 | 成功响应 |
|---|---|---|---|
| GET | `/api/health` | 健康检查；只返回提供商名和模型名，绝不含 Key | 200 `{ ok: true, llm: { provider: 'deepseek' \| 'mock', qualityModel, fastModel } }` |
| GET | `/api/discussions?status=live,paused` | 讨论列表；status 可选，逗号分隔多选 | 200 `{ items: DiscussionListItem[] }`，排序：状态优先级 live > summarizing > paused > lineup_ready > draft > failed > ended，同级按 updatedAt 倒序 |
| POST | `/api/discussions` | 创建讨论并同步生成阵容。body `{ topic: string, expertCount?: number }`（2–6，默认 4） | 201 `{ snapshot: DiscussionSnapshot }`（status=lineup_ready）；LLM 失败返回 502 `LLM_ERROR`，讨论保留为 failed，`error.details` 带 `{ discussionId }` 以便重试 |
| GET | `/api/discussions/:id` | 完整快照 | 200 `{ snapshot }` |
| POST | `/api/discussions/:id/lineup/regenerate` | 换一批阵容（仅 lineup_ready / failed） | 200 `{ snapshot }` |
| POST | `/api/discussions/:id/start` | 确认阵容开播（仅 lineup_ready） | 200 `{ discussion }` |
| POST | `/api/discussions/:id/pause` | 暂停（仅 live；当前发言结束后停住） | 200 `{ discussion }` |
| POST | `/api/discussions/:id/resume` | 继续（仅 paused） | 200 `{ discussion }` |
| POST | `/api/discussions/:id/end` | 结束并总结（live / paused → summarizing，异步总结后 ended） | 202 `{ discussion }` |
| DELETE | `/api/discussions/:id` | 删除（停止引擎、断开 SSE、级联删除） | 204 |
| GET | `/api/discussions/:id/stream?since=<seq>` | SSE 事件流 | `text/event-stream` |

### 2.6 SSE 协议

- 响应头：`Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`、`X-Accel-Buffering: no`；连接建立后先发 `retry: 3000`。
- 消息格式：可选 `id: <seq>` 行 + `data: <JSON>` 行 + 空行。不使用 `event:` 字段，事件类型放在 JSON 的 `type` 中。每个事件 JSON 都包含 `type`、`discussionId`、`at`（ISO 时间）。
- **持久事件**：先写入 events 表获得 seq，再广播，带 `id: <seq>`。**瞬时事件**：不落库、不带 id。
- 补发：首次连接使用 `?since=<snapshot.lastEventSeq>`；断线重连时浏览器自动带 `Last-Event-ID` 头（优先于 since），服务端先补发 seq 更大的持久事件，再推送实时事件。
- 心跳：每 15 秒发送注释行 `: ping`。
- 观众数：某讨论当前 SSE 连接数；连接建立/断开时广播 `viewers.updated`。
- 讨论不存在返回 404 JSON 错误（不建立流）；讨论被删除时服务端主动结束该讨论的所有流。

| type | 持久 | 额外字段 |
|---|---|---|
| `discussion.status` | 是 | `status, turnCount, maxTurns` |
| `lineup.updated` | 是 | `participants: Participant[]` |
| `participant.state` | 否 | `participantId, agentState, agentIntent, focus` |
| `utterance.started` | 否 | `utteranceId, participantId, act, replyToParticipantId, seq` |
| `utterance.delta` | 否 | `utteranceId, delta` |
| `utterance.completed` | 是 | `utterance: Utterance`（最终文本以此为准） |
| `insights.updated` | 是 | `insights: Insight[]`（当前全部条目，客户端整体替换） |
| `summary.completed` | 是 | `summary: string` |
| `viewers.updated` | 否 | `viewerCount` |
| `error` | 否 | `code, message`（中文、可展示） |

内部的举手/抢答等意图只通过 `participant.state` 体现在专家状态小窗，**不会**成为 Transcript 条目。

### 2.7 讨论引擎

组件：`DiscussionManager`（`Map<discussionId, DiscussionRunner>`，负责 start/pause/resume/end/delete 与启动恢复）、`DiscussionRunner`（单个讨论的异步主循环）、`EventBus`（按 discussionId 分频道；持久事件先写库再广播）、`LLMGateway`（模型路由、并发、重试）。

主循环：

```text
run():
  若该讨论还没有任何发言：speakHost('opening')
  while status == 'live' 且 turnCount < maxTurns:
    action = decideHostAction(ctx)
    if action 是 follow_up / bridge / invite：speakHost(action, target)；addressed = target
    else:
      bids = 并行请求每位专家出价（fast 档，JSON）
      逐个更新专家 agentState/agentIntent/focus 并推送 participant.state
      pick = selectNextSpeaker(bids, ctx, rng)
      if pick 为空：ctx.noBidders = true；continue（下一轮由主持人点名）
      speakExpert(pick)；addressed = null
    turnCount += 1，推送 discussion.status
    scheduleInsights()   // 串行队列、合并触发、不阻塞主循环
    sleep(PACING_MS)；若被暂停则等待恢复或结束
  summarize()

speak(participant, act, replyTo):
  预留 seq 与 utteranceId；participant → speaking；推送 participant.state 与 utterance.started
  流式请求（fast 档）→ 句子限流器过滤 → 推送 utterance.delta，同时更新内存 liveUtterance
  final = clampSentences(sanitizeUtterance(全文), 上限)
  写入 utterances，speak_count + 1；推送 utterance.completed（持久）
  participant → idle（清空 intent）；推送 participant.state

summarize():
  status → summarizing（持久）；等待洞察队列清空
  主持人 speaking；流式请求总结（quality 档，自然语言 3–5 段）→ utterance.delta
  写入 act='closing' 的发言与 discussions.summary；推送 utterance.completed、summary.completed
  status → ended，写 ended_at；全部参与者回到 idle
```

句数上限：专家发言与主持人插话（follow_up/bridge/invite）最多 2 句；开场 opening 最多 3 句；总结 closing 不限句数。主持人点名（addressed）后，被点名的专家在下一轮出价中获得加成（见调度规则）。

容错：出价失败 → 视为不发言；发言生成失败 → 重试 1 次，仍失败推送 `error` 事件（“某嘉宾暂时掉线，讨论继续”）并跳过本轮（不计 turnCount）；连续 3 轮失败 → 状态 paused，error_message 写“大模型服务暂时不可用，讨论已暂停，可稍后继续”；洞察提炼失败 → 记日志，下次触发时连同遗漏的发言一起处理；总结失败 → 重试 1 次，仍失败用代码模板根据当前共识/分歧生成自然语言兜底总结；阵容生成 JSON/校验失败 → 把错误原因反馈给模型重试 1 次，仍失败 → 502 `LLM_ERROR`，讨论 failed。

#### 纯函数规则（后续 TDD 阶段将逐条写成测试，务必写清楚）

**A. 阵容规范化 `normalizeLineup(raw, expertCount)`**
- 输入为模型 JSON：`{ host: { name, profession, title, stance, stanceTag?, persona? }, experts: [ 同结构 ] }`。
- 字符串字段修剪；截断：name 12、profession 20、title 30、stance 80、stanceTag 6、persona 200；缺 stanceTag → “观点”，缺 persona → 空串。
- host 缺失或任一必填字段（name/profession/title/stance）为空 → `INVALID_FORMAT`；专家多于 N 取前 N；少于 N → `INSUFFICIENT_EXPERTS`；姓名重复（含与主持人重复）→ `DUPLICATE_NAMES`；N ≥ 2 且所有专家 stanceTag 相同 → `LOW_DIVERSITY`。错误类型 `LineupValidationError(code)`。
- 颜色由代码分配：主持人 `#E8C872`；专家按 seat 依次取 `EXPERT_PALETTE = ['#5B9DFF', '#FF6B9A', '#3DDC97', '#B18CFF', '#FF9F43', '#2ED3E6']`；avatar = 姓名第一个字符；seat：主持人 0，专家 1..N。

**B. 出价规范化 `normalizeBid(raw, ctx)`**
- 模型 JSON：`{ "wantToSpeak": true, "intent": "rebut", "urgency": 0.8, "replyTo": "E2", "focus": "质疑 E2 的成本估算" }`。
- wantToSpeak 非布尔 → false；intent 不在枚举 → raise_hand；urgency 可为数字或数字字符串，钳制到 [0,1]，无法解析 → 0.5；replyTo 为别名（H / E1..En），映射为 participantId，未知或指向自己 → null；focus 修剪，超过 40 字截断并以“…”结尾，空 → null。
- 输入不是对象 → `{ wantToSpeak: false, intent: 'raise_hand', urgency: 0, replyToParticipantId: null, focus: null }`。

**C. 调度打分 v1 `selectNextSpeaker(input)`**
- 输入：`bids`（每位专家规范化后的出价）、`lastSpeakerId`（上一条发言人，可能是主持人）、`recentExpertSpeakerIds`（最近 2 条专家发言的发言人）、`lastSpokeTurn`（专家 id → 最近一次发言所在的 turn 序号，未发言则无）、`turnIndex`、`addressedParticipantId`（主持人刚点名的专家，可空）、`rng`（返回 [0,1) 的函数，可注入以便测试）。
- 被点名的专家若没有出价或 wantToSpeak=false，视为一条 `raise_hand, urgency 0.5` 的出价。
- 候选：wantToSpeak 为 true 且不是 lastSpeakerId（上一条若是主持人则不排除任何专家）。无候选返回 null。
- 得分 = urgency + 意图权重（rebut 0.30，interrupt 0.25，supplement 0.15，raise_hand 0.10）+ 直接回应上一位发言人 0.20 + 抢答加成（interrupt 且 urgency ≥ 0.8）0.30 − 最近发言惩罚（在 recentExpertSpeakerIds 中）0.25 + 公平加成（从未发言或距上次发言 ≥ 4 轮）0.15 + 被点名加成 0.60 + rng() × 0.05。
- 返回得分最高者 `{ participantId, intent, replyToParticipantId, score }`。这些权重以常量 `SCHEDULER_WEIGHTS` 导出。
- 设计意图：发言顺序由“谁更想说、说什么”决定，而不是按座位轮流；硬规则保证同一专家不会连续两次发言。

**D. 主持人策略 `decideHostAction(ctx)`**（按顺序匹配，命中即返回）
0. 上一条发言来自主持人 → `{ action: 'experts' }`
1. 上一轮无人出价（noBidders）→ `invite`，目标为 speakCount 最少的专家（并列取 seat 最小）
2. 距上次主持人发言已有 ≥ `HOST_INTERVAL`（3）条专家发言：
   a. 存在 active 分歧且其 stances 含 ≥ 2 名专家 → `bridge`，取 updatedAtSeq 最大的那条分歧，目标为其中不是上一位发言人、speakCount 最少（并列 seat 最小）的专家；
   b. 否则 → `follow_up`，目标为上一位专家发言人
3. 存在 speakCount = 0 的专家且 turnCount ≥ expertCount + 1 → `invite` 该专家（多人取 seat 最小）
4. 否则 → `{ action: 'experts' }`

**E. 洞察合并 `mergeInsights(current, patch, ctx)`**
- 模型 JSON（增量）：`{ "consensus": [{ "ref": "C1" 或 null, "content": "…", "participants": ["E1","E3"], "evidence": [3,5] }], "divergences": [{ "ref": "D1" 或 null, "content": "…", "stances": [{ "who": "E1", "position": "…" }], "evidence": [4,6], "resolved": false }] }`。只需返回新增或变化的条目。
- ctx：`discussionId`、`aliasToParticipantId`（仅专家别名）、`refToInsightId`（C1../D1.. → 已有 insight id）、`validSeqs`、`currentSeq`、`now`、`newId()`、`maxPerKind`（6）、`similarityThreshold`（0.6）。
- 规则：① content 修剪、截断 80 字，空则丢弃；② 别名映射，未知别名与主持人 H 丢弃，共识去重后少于 2 名专家、分歧少于 2 名专家 → 丢弃；position 截断 40 字，共识缺 position 记为“认同”；③ evidence 只保留 validSeqs 中的 seq（去重升序），为空 → 丢弃（无证据不入库）；④ ref 命中同类已有条目 → 更新：content 覆盖、stances 按 participantId 合并（新值覆盖旧值，旧的保留）、evidence 合并去重、updatedAtSeq = currentSeq、updatedAt = now；分歧 resolved=true → status 'resolved'；⑤ 无 ref 或 ref 未命中 → 与同类已有条目计算相似度（去掉标点和空白后的字符二元组 Jaccard），≥ 阈值按 ④ 更新该条，否则新建（status active）；⑥ 补丁未提及的已有条目原样保留；⑦ 每类超过 maxPerKind 时按 updatedAtSeq 降序保留前 maxPerKind 条；⑧ 返回 `{ insights, changed }`。

**F. 句子规则**
- `sanitizeUtterance(text, speakerName)`：去掉开头的发言人前缀（「{姓名}：」「{姓名}:」「【{姓名}】」「**{姓名}**：」「主持人：」，姓名精确匹配）；整体被引号（“” " 「」）包裹时去掉；去掉 Markdown 符号（** __ ` 行首 # 和 - ）；换行与多余空白合并；修剪。
- `clampSentences(text, max)`：句末标记为 。！？!? 和省略号（… / ……）；英文句点仅在后面是空白或结尾、且前一字符不是数字时算句末（避免把 3.5 拆开）；紧跟句末的右引号/右括号（” ’ " ' 」 』 ） ) 】）归入该句；保留前 max 句；没有任何句末标记且超过 120 字 → 截取前 120 字加“…”。
- `createSentenceLimiter(max, speakerName)`：流式过滤器。`push(delta)` 返回本次可推送给前端的文本，`done` 表示已达上限；开头先缓冲（直到出现“：”“:”“】”或累计 16 个字符）以便去掉前缀；达到上限后不再输出。前端在收到 `utterance.completed` 后以最终文本替换流式文本。

**G. 上下文构建**
- `buildAliasMap(participants)`：主持人 H，专家按 seat 升序 E1..En。
- `buildTranscriptWindow(utterances, participants, k = 10)`：最近 k 条，时间正序，每行 `#{seq} {别名} {姓名}（{title}）：{content}`。
- `formatInsightsForPrompt(insights, participants)`：共识按创建顺序编号 C1..，分歧 D1..；分歧列出各专家立场；resolved 的标“（已化解）”。

**H. JSON 解析 `parseJsonLoose(text)`**：修剪；去掉 ```json 围栏；直接解析失败时截取第一个 `{` 到最后一个 `}` 再解析；仍失败抛 `LLMFormatError`。

常量：`HOST_INTERVAL = 3`、`TRANSCRIPT_WINDOW = 10`、`MAX_INSIGHTS_PER_KIND = 6`、`FOCUS_MAX = 40`、`SIMILARITY_THRESHOLD = 0.6`、`EXPERT_COUNT = { min: 2, max: 6, default: 4 }`、`TOPIC_LENGTH = { min: 2, max: 200 }`。

### 2.8 LLM 网关与模型路由

```ts
type LLMTask = 'lineup' | 'bid' | 'utterance' | 'host' | 'insights' | 'summary';
type LLMTier = 'quality' | 'fast';
interface LLMRequest { task: LLMTask; system: string; user: string; json?: boolean; temperature?: number; maxTokens?: number; context?: unknown /* 仅 mock 使用的结构化上下文 */; signal?: AbortSignal; discussionId?: string }
interface LLMProvider { name: 'deepseek' | 'mock'; complete(req: LLMRequest & { model: string }): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }>; stream(req: LLMRequest & { model: string }): AsyncIterable<string> /* 只产出 content 增量 */ }
```

| 任务 | 档位 | 默认模型 | temperature | 说明 |
|---|---|---|---|---|
| lineup | quality | deepseek-v4-pro | 0.9 | 阵容生成，JSON |
| summary | quality | deepseek-v4-pro | 0.5 | 主持人总结，流式自然语言 |
| bid | fast | deepseek-flash | 0.7 | 专家出价，JSON |
| utterance | fast | deepseek-flash | 0.8 | 专家发言，流式 |
| host | fast | deepseek-flash | 0.7 | 主持人开场/追问/串联/点名，流式 |
| insights | fast | deepseek-flash | 0.2 | 共识/分歧提炼，JSON |

- 提供商选择：`LLM_PROVIDER` 显式指定优先；否则有 `LLM_API_KEY` 用 deepseek，没有则用 mock 并在启动日志提示。
- OpenAI 兼容实现：`POST {LLM_BASE_URL}/chat/completions`，`Authorization: Bearer {LLM_API_KEY}`；JSON 任务加 `response_format: {"type":"json_object"}`；流式解析 `data:` 行，忽略 `[DONE]`，只取 `choices[0].delta.content`；**`reasoning_content` 一律丢弃**；超时 quality 90s / fast 30s；网络错误、429、5xx 重试 1 次（退避 800ms）；全局并发上限 `LLM_MAX_CONCURRENCY`；日志只记录 task、model、耗时、token 用量，不记录 Key 与推理内容。
- mock 实现：按 discussionId + task + 调用序号确定性地生成中文内容；利用 `context` 结构化数据保证内容连贯（例如反驳会点名被反驳者，提炼的分歧来自真实的反驳关系）；JSON 任务返回 JSON 字符串，走与真实模型相同的解析/校验路径；`stream` 将文本切成 2–4 字的分片，间隔 `MOCK_STREAM_DELAY_MS`；每次调用延迟 `MOCK_LATENCY_MS`。

### 2.9 运行时 Prompt 与上下文管理（防幻觉）

- 每次 LLM 调用都无状态：不累积多轮 messages，由代码从数据库重建精简上下文 = 角色卡 + 话题 + 阵容别名表 + 当前共识/分歧 + 最近 10 条发言 + 本次任务指令。上下文长度与讨论长度无关，讨论之间天然隔离。
- 用别名（H/E1../C1../D1..）代替 UUID，模型不接触内部 id，代码负责映射与校验。
- JSON 任务：json_object 模式 + zod 校验 + 失败重试 1 次 + 兜底值。
- 发言约束：中文、1–2 句、不加姓名前缀、不用 Markdown、不写动作描写；只回应 transcript 中真实出现的观点；引用数据要加“据我了解/大致”等限定，不得编造具体报告或机构名称。
- 共识/分歧必须给出 evidence（发言 seq），后端校验存在性，无证据不入库。
- 专家小窗的“公开关注点”来自出价任务单独输出的 focus 字段（面向观众的一句话），绝不使用 reasoning_content。
- 总结：自然语言 3–5 段，禁止 JSON、代码块、表格；后端校验输出，若以 `{` 或 `[` 开头或能被 JSON.parse 解析则视为失败，重试或兜底。

### 2.10 多讨论并行隔离

- 每个讨论一个 Runner 实例；RNG、计数器、洞察队列、暂停信号、AbortController 都是实例字段，不使用模块级可变状态。
- EventBus 按 discussionId 分频道，SSE 连接只订阅自己的讨论。
- 所有涉及子表的 repository 函数都以 discussionId 为参数并在 SQL 中过滤。
- events.seq、utterances.seq 都按讨论独立递增。
- 仅 LLM 并发上限是全局共享资源；每次请求的上下文只来自本讨论。

### 2.11 安全

- API Key 只存在于后端环境变量（server/.env，被 git 忽略）；`/api/health` 只返回提供商名和模型名；日志不打印 Key；前端从不直接调用大模型。
- 所有请求体用 zod 校验；SQL 一律使用预编译语句与参数绑定。
- `reasoning_content` 丢弃，不存储、不推送。

### 2.12 配置项

后端（`server/.env`，模板 `server/.env.example`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| PORT | 8787 | 后端端口 |
| DATABASE_PATH | ./data/panel.db | SQLite 文件（相对 server/），测试可用 `:memory:` |
| LLM_PROVIDER | 空（自动） | `deepseek` / `mock` |
| LLM_API_KEY | 空 | DeepSeek API Key，仅后端读取 |
| LLM_BASE_URL | https://api.deepseek.com | OpenAI 兼容地址 |
| LLM_MODEL_QUALITY | deepseek-v4-pro | 质量档模型 |
| LLM_MODEL_FAST | deepseek-flash | 速度档模型 |
| LLM_MAX_CONCURRENCY | 6 | 全局并发上限 |
| MAX_TURNS | 16 | 每场正文发言上限 |
| PACING_MS | 800 | 两条发言之间的节奏间隔 |
| MOCK_LATENCY_MS | 400 | mock 每次调用的模拟延迟 |
| MOCK_STREAM_DELAY_MS | 30 | mock 流式分片间隔 |

前端（Vite）：`WEB_PORT`（默认 5173）、`API_PROXY_TARGET`（默认 http://localhost:8787）。

## 3. 产出文件与章节要求（全部简体中文）

### 3.1 `docs/PRD.md`

1. 产品概述（定位、核心价值主张、一句话场景）
2. 目标用户画像（表格）与典型使用场景（每类用户 1 个具体场景）
3. 痛点 → 解决方案映射表（4 条痛点各自对应哪些功能）
4. 功能需求：F1 首页大厅、F2 嘉宾生成与阵容确认、F3 演播厅主流程、F4 专家状态小窗、F5 实时共识与分歧、F6 现场 Transcript、F7 主持人总结、F8 导出实录 Markdown（P1，可选）。每个功能写：优先级（P0/P1）、用户故事、交互要点、**验收标准**（编号 AC-F1-1 起，Given/When/Then，可直接转成测试）
5. 非功能需求：密钥安全、并行隔离、实时性（SSE；目标：真实模型下首个字幕 ≤ 3 秒出现、单条发言间隔 3–8 秒）、响应式（三档：超宽屏 ≥ 1600px、桌面 1024–1599px、窄屏 < 1024px；页面整体不滚动，区域独立滚动）、中文 UI、可测试性（mock 提供商）、可观测性（日志）
6. 核心用户流程（mermaid flowchart：大厅 → 新建 → 阵容确认 → 演播厅 → 结束/回看）
7. 范围外与后续迭代
8. 术语表（举手、抢答、补充、反驳、正文发言、共识、分歧、公开关注点、持久事件/瞬时事件等）

### 3.2 `docs/ER.md`

1. mermaid `erDiagram`（6 张表、全部字段、PK/FK、关系基数，关系标签用中文）
2. 数据字典：每张表一个表格（列、类型、约束、说明）
3. 枚举值说明（status、role、agent_state、agent_intent、act、kind、insight status）
4. 索引与约束、PRAGMA 设置
5. 设计说明：为什么主持人与专家同表、为什么单独的 insight_stances、为什么有 events 表（补发 + 回放）、为什么 seq 按讨论递增、JSON 列的取舍
6. 典型查询示例（列表页聚合、快照组装、按 since 补发事件）

### 3.3 `docs/API.md`

1. 约定：Base URL、JSON、camelCase、时间格式、错误格式与错误码表
2. 数据类型：2.4 的 TypeScript 定义（按 shared 包导出名）
3. 每个 REST 接口：方法与路径、说明、请求参数/请求体（含校验规则）、成功响应示例（完整 JSON）、可能的错误
4. SSE：连接方式、消息格式（原始文本示例）、事件类型表（字段、持久/瞬时）、每种事件的 JSON 示例、补发与重连、心跳、观众数
5. 客户端接入时序（mermaid sequenceDiagram：GET 快照 → 带 since 连接 SSE → 增量事件 → 断线重连）
6. 状态转换与接口对照表（哪个状态允许调用哪个接口）

### 3.4 `docs/ARCHITECTURE.md`

1. 系统总览（mermaid flowchart：浏览器 / Vite 代理 / Express 路由 / DiscussionManager / Runner / EventBus / LLMGateway / DeepSeek 或 mock / SQLite）
2. 目录与模块边界（shared、server/src 下 config、db、llm、prompts、core、engine、routes；web/src 下 api、state、components、pages）
3. 讨论引擎：主循环伪代码 + 一轮发言的 mermaid sequenceDiagram（主持人策略 → 并行出价 → 调度 → 流式发言 → 落库 → 推送 → 异步洞察）
4. 状态机：讨论状态与嘉宾 Agent 状态各一张 mermaid stateDiagram-v2
5. 核心纯函数规则：2.7 的 A–H 全部写入，权重与阈值用表格列出（这是 TDD 阶段的测试依据，必须精确）
6. LLM 网关与模型路由（2.8）、mock 提供商设计
7. 运行时 Prompt 与上下文管理、防幻觉策略（2.9），给出每个任务的输入结构与输出 JSON 结构示例
8. 并行隔离与并发（2.10）、容错与恢复（2.7 容错部分 + 服务重启）
9. 安全设计（2.11）、配置项（2.12）
10. 开发范式路线图：SDD（本阶段）→ DDD（设计驱动前端组件与页面）→ TDD（核心逻辑先写测试再实现）→ E2E（系统级端到端测试与质量闭环），说明每个阶段的输入文档与产出

## 4. 写作与 mermaid 规范

- 四份文档之间的字段名、枚举值、事件名、错误码、默认值必须完全一致，以第 2 节为准。
- mermaid 注意事项：erDiagram 属性写成 `TEXT id PK "UUID"` 形式，类型是单个英文单词，中文说明放在双引号里；关系写 `discussions ||--o{ participants : "拥有"`；flowchart 中包含括号、斜杠或中文标点的节点文字用双引号包起来，如 `A["浏览器 (React)"]`；sequenceDiagram 的消息文字里不要出现分号；stateDiagram-v2 用 `live : 直播中` 给状态加中文说明。
- 每份文档开头写“文档目的 / 读者 / 版本 v1.0 / 关联文档”。
- 不写代码实现，只写规格；示例 JSON 必须是合法 JSON。

## 5. 自检与报告

完成后逐项自检：4 个文件都存在；PRD 覆盖 1.4 全部 7 条功能要求与 1.5 全部技术要求；每个功能都有 AC 编号；ER 图包含 6 张表全部字段；API 覆盖 11 个接口和 10 种事件；ARCHITECTURE 写全 A–H 规则与权重表；mermaid 代码块语法自查。

报告：文件清单与每个文件的章节目录、自检结果、你认为规格中存在的风险或需要编排者决定的问题。
