# 【SDD 阶段 · Prompt 03】契约代码化：SQLite 建表脚本、样例数据、数据访问层与共享类型

| 项 | 内容 |
|---|---|
| 范式 | SDD 第二步：把 `docs/ER.md` / `docs/API.md` 一比一落成 SQL 与 TypeScript 契约 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`、`docs/ER.md`、`docs/API.md`、`docs/ARCHITECTURE.md`、`docs/PRD.md` |
| 产出 | `server/db/schema.sql`、`server/db/seed.sql`、`server/scripts/db-init.ts`、`server/src/db/**`、`shared/src/**` 及测试 |
| 约束 | 不写引擎、路由、LLM、前端；不安装依赖；不碰 `server/.env` |

> 为什么单独一步：规格文档是给人和 AI 读的，契约代码是给编译器读的。把类型、枚举、事件、表结构先固化成代码，后面的前端（DDD）和后端（TDD）子代理就能并行开发而不会对不上字段。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md`，再完整读 `docs/ER.md` 与 `docs/API.md`；`docs/ARCHITECTURE.md` 读数据、事件、常量相关章节。
- 规格是唯一事实来源：表名、列名、枚举、事件名、默认值必须与文档一致。发现文档之间不一致时，数据库以 `docs/ER.md` 为准，接口与事件以 `docs/API.md` 为准，并在报告中列出。

## 1. `shared/src`（@aps/shared，前后端唯一类型来源）

- `constants.ts`
  - 枚举数组（`as const`）：DISCUSSION_STATUSES、PARTICIPANT_ROLES、AGENT_STATES、BID_INTENTS、SPEECH_ACTS、HOST_ACTS、EXPERT_ACTS、INSIGHT_KINDS、INSIGHT_STATUSES、DISCUSSION_SOURCES
  - `HOST_COLOR = '#E8C872'`；`EXPERT_PALETTE`（6 色，与文档一致）
  - `EXPERT_COUNT = { min: 2, max: 6, default: 4 }`；`TOPIC_LENGTH = { min: 2, max: 200 }`；`FIELD_LIMITS`（name 12、profession 20、title 30、stance 80、stanceTag 6、persona 200、focus 40、insightContent 80、position 40）
  - `MAX_SENTENCES = { expert: 2, hostInterjection: 2, opening: 3 }`
  - 中文标签：`STATUS_LABELS`（draft 生成中、lineup_ready 待开播、live 直播中、paused 已暂停、summarizing 总结中、ended 已结束、failed 生成失败）、`AGENT_STATE_LABELS`（待机 / 准备发言 / 发言中）、`INTENT_LABELS`（举手 / 抢答 / 补充 / 反驳）、`ACT_LABELS`（开场 / 追问 / 串联 / 点名 / 总结 / 陈述 / 抢答 / 补充 / 反驳）
  - `LOBBY_GROUPS`：直播中 = [live, summarizing, paused]，待开播 = [lineup_ready, draft, failed]，往期回放 = [ended]
  - `STATUS_PRIORITY`（列表排序：live > summarizing > paused > lineup_ready > draft > failed > ended）
- `domain.ts`：全部领域类型的 zod schema 与 `z.infer` 类型：DiscussionSchema、ParticipantSchema、UtteranceSchema、InsightStanceSchema、InsightSchema、LiveUtteranceSchema、DiscussionSnapshotSchema、ParticipantBriefSchema、DiscussionListItemSchema
- `api.ts`：CreateDiscussionRequestSchema（topic 修剪后 2–200 字，expertCount 整数 2–6、默认 4，错误信息为中文）、各接口响应 schema（ListDiscussionsResponse、SnapshotResponse、DiscussionResponse、HealthResponse）、`ERROR_CODES` 与 `ApiErrorBody` 类型、`isApiErrorBody()` 辅助函数
- `events.ts`：`StreamEvent` 判别联合（10 种，字段与 `docs/API.md` 一致，每个都含 `type`、`discussionId`、`at`）、`StreamEventSchema`（`z.discriminatedUnion('type', ...)`）、`DURABLE_EVENT_TYPES` / `EPHEMERAL_EVENT_TYPES`、`isDurableEvent()`
- `index.ts`：统一导出（保留 `CONTRACT_VERSION`）
- 测试 `shared/src/*.test.ts`：合法 / 非法样例解析；CreateDiscussionRequest 默认 expertCount = 4、topic 会修剪、越界给出中文错误；事件联合能区分 10 种事件；持久 / 瞬时分类与文档一致

## 2. `server/db`

### 2.1 `schema.sql`

与 `docs/ER.md` 完全一致：6 张表、CHECK、FK 与 ON DELETE 行为、UNIQUE、索引；全部使用 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`，可重复执行；文件头写中文注释说明用途。PRAGMA 不写在这里（由连接代码设置）。

### 2.2 `seed.sql`（至少 6 条高质量样例讨论）

通用要求：幂等（`INSERT OR IGNORE`）；`source = 'seed'`；固定、可读的 UUID（例如 `00000000-0000-4000-8000-000000000101`）；固定的 ISO 时间字符串；所有参与者 `agent_state = 'idle'`。

**5 条 `lineup_ready` 讨论**（expert_count = 4，每条 1 主持人 + 4 专家，无发言）：

1. AI 编程助手会让初级程序员岗位消失吗？
2. 城市应该全面放开 Robotaxi（无人驾驶出租车）吗？
3. 四天工作制在中国企业可行吗？
4. 大学应该允许学生用 AI 完成作业吗？
5. 新能源车价格战：消费者的胜利还是行业的灾难？

**1 条 `ended` 的完整回放**：「远程办公会全面取代坐班吗？」（1 主持人 + 4 专家）

- 至少 14 条 utterances，seq 从 1 连续。第 1 条为 opening，最后 1 条为 closing（内容等于 summary 全文）；中间至少有 follow_up、bridge、invite 各 1 条，以及 statement、interrupt、supplement、rebut 各至少 1 条。
- 同一专家不连续发言；除 opening（≤ 3 句）和 closing 外，每条 1–2 句；反驳 / 补充用 reply_to_participant_id 指向具体专家，内容要有真实交锋。
- insights：至少 3 条共识、3 条分歧（其中 1 条 `status = 'resolved'`）；每条都有 evidence_seqs（指向真实存在的 seq）和 insight_stances（至少 2 名专家）。
- summary：3–4 段自然语言，段落之间用 `\n\n`，点出共识、分歧和开放问题。
- events：与这场讨论对应的持久事件序列，seq 从 1 连续，至少包含 `discussion.status`（live）、每条发言的 `utterance.completed`、若干次 `insights.updated`、`summary.completed`、`discussion.status`（ended）。payload 必须是与 shared `StreamEvent` 一致的 JSON。
- `turn_count` 等于正文发言数（不含 opening、closing），`max_turns = 16`。

**嘉宾质量要求**：姓名虚构，不得使用真实名人姓名；职业与头衔真实可信、与话题强相关；4 位专家立场多元（stance_tag 至少 3 种不同取值，如 支持 / 反对 / 谨慎乐观 / 中立 / 跨界视角）；persona 写清背景与说话风格；主持人的 stance 写主持风格；颜色：主持人 `#E8C872`，专家按 seat 依次 `#5B9DFF`、`#FF6B9A`、`#3DDC97`、`#B18CFF`；avatar 为姓名首字。

种子数据用 SQL 文件而不是 TS 代码生成，方便评审直接阅读。

## 3. `server/scripts/db-init.ts`（完善占位实现）

- `npm run db:init`：按配置的 DATABASE_PATH 打开数据库（复用 `src/config.ts` 读取 `server/.env` 与环境变量），执行 schema.sql 与 seed.sql，打印各表行数。
- `npm run db:reset`：先删除库文件及 `-wal` / `-shm`，再初始化。
- 不打印任何配置值。

## 4. `server/src/db`（数据访问层）

- `connection.ts` 增加：`initSchema(db)`（执行 schema.sql，可重复执行）、`seedIfEmpty(db)`（discussions 为空时执行 seed.sql）、`withTransaction(db, fn)`（`BEGIN IMMEDIATE` / `COMMIT`，fn 抛错时 `ROLLBACK` 并重新抛出）。
- `mappers.ts`：行 ↔ 领域对象（snake_case ↔ camelCase；evidence_seqs 的 JSON 解析；insight 组装 stances）。
- `repositories/*.ts`：函数式风格，第一个参数是 db；涉及子表的函数都带 discussionId 并在 SQL 中过滤；只用预编译语句与参数绑定。必须提供：
  - `discussions.ts`：`create({ topic, expertCount, maxTurns, source? })`（status = draft）、`getById`、`list({ statuses?, viewerCountOf? })`（返回 DiscussionListItem，含 participants brief、utteranceCount、latestUtterance；viewerCount 由 `viewerCountOf(id)` 提供，默认 0；排序按 STATUS_PRIORITY，同级 updatedAt 倒序）、`updateStatus(id, status, patch?)`（patch 可含 startedAt / endedAt / errorMessage；自动更新 updated_at）、`incrementTurnCount`、`setSummary`、`remove`、`markInterruptedAsPaused()`（live / summarizing → paused，返回受影响的 id 列表）
  - `participants.ts`：`listByDiscussion`（按 seat）、`replaceLineup(discussionId, drafts)`（事务：删旧插新）、`updateAgentState(discussionId, participantId, { agentState, agentIntent, focus })`、`incrementSpeakCount(discussionId, participantId)`、`resetAgentStates(discussionId)`
  - `utterances.ts`：`insert(discussionId, { id?, participantId, seq, act, replyToParticipantId, content })`、`listByDiscussion`（按 seq）、`count`、`nextSeq`、`latest`
  - `insights.ts`：`listByDiscussion`（含 stances）、`replaceAll(discussionId, insights)`（事务：删除本讨论旧条目再插入）
  - `events.ts`：`append(discussionId, event)`（事务内取 max(seq)+1 写入，返回 seq）、`listSince(discussionId, seq)`、`lastSeq(discussionId)`
  - `snapshot.ts`：`buildSnapshot(db, discussionId, { viewerCount, liveUtterance })` → `DiscussionSnapshot | null`
- 领域类型全部从 `@aps/shared` 导入，不要在 server 里重复定义。

## 5. 测试（`server/src/db/**/*.test.ts`，使用 `:memory:` 或临时文件库）

- schema 可重复执行；seed 后共 6 条讨论、每条 5 位参与者；5 条 lineup_ready、1 条 ended。
- ended 样例：utterances seq 连续且 ≥ 14；第一条 opening、最后一条 closing；没有专家连续发言；insights 至少 3 共识 3 分歧且 1 条 resolved；所有 evidence_seqs 都指向存在的 seq；events seq 连续。
- 每条 seed 讨论的 `buildSnapshot` 结果能通过 `DiscussionSnapshotSchema.parse`；ended 样例 events 的 payload 都能通过 `StreamEventSchema.parse`。
- repository CRUD；replaceLineup 事务；级联删除（删除讨论后子表为空）；隔离（两个讨论的数据互不可见）；events seq 按讨论独立递增；list 排序规则；markInterruptedAsPaused。

## 6. 验证（仓库根目录）

`npm run typecheck`；`npm test -w @aps/shared`；`npm test -w @aps/server`；`npm run db:reset`（报告各表行数）。

## 7. 报告

文件清单；测试数量与结果；6 个种子话题及嘉宾阵容摘要（姓名 / 职业 / 立场标签）；与规格的偏差和文档之间的不一致之处。
