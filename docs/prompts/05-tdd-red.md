# 【TDD 阶段 · Prompt 05】Red：先写核心逻辑的失败测试与接口桩

| 项 | 内容 |
|---|---|
| 范式 | TDD（Test-Driven Development）Red 步：只写测试与带完整签名的桩，不写实现 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`、`docs/ARCHITECTURE.md`（纯函数规则 A–H、引擎、LLM 网关、隔离）、`docs/API.md`、`docs/PRD.md`（验收标准 AC）、`shared/src`、`server/src/db` |
| 产出 | `docs/TEST-PLAN.md`、`server/src/**/*.test.ts`、`server/src` 下各模块的桩 |
| 约束 | 只改 `server/` 与新建 `docs/TEST-PLAN.md`；不改 `shared/`、`web/`；不安装依赖 |

> 为什么先写测试：嘉宾生成、发言调度、共识提炼是这个产品最容易“看起来能跑、其实不对”的部分。先把规格逐条翻译成可执行的断言，实现阶段的 AI 就只能朝规格收敛，而不是自由发挥。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md`，完整读 `docs/ARCHITECTURE.md` 与 `docs/API.md`，再读 PRD 的验收标准、`shared/src` 与 `server/src/db`。
- 并行：另一个子代理正在 `web/` 下开发前端。验证只运行 `-w @aps/server` 的命令。

## 1. `docs/TEST-PLAN.md`

1. 测试分层：单元（core 纯函数）/ 集成（引擎 + mock LLM + SQLite、REST、SSE）/ E2E（Playwright，后续阶段）。
2. 需求 → 测试映射表：PRD 的每个 AC 编号 → 测试文件与用例名（E2E 场景先列出，标注“E2E 阶段实现”）。
3. mock LLM 策略与故障注入方式。
4. E2E 场景清单（供 E2E 阶段直接实现）：大厅显示 seed 列表；新建 → 阵容 → 确认 → 直播；专家小窗状态变化；Transcript 不含内部事件；共识 / 分歧在结束前出现；结束 → 自然语言总结且无 JSON；两个讨论并行隔离；三档视口页面不整体滚动且区域可滚动；前端资源与 API 响应不含 API Key；暂停 / 继续。

## 2. 桩与签名（`server/src/`）

每个桩导出完整签名与类型，函数体 `throw new Error('NOT_IMPLEMENTED')`。类型、常量、错误类可以直接写完整。

- `core/lineup.ts`：`LineupValidationError`（code：INVALID_FORMAT | INSUFFICIENT_EXPERTS | DUPLICATE_NAMES | LOW_DIVERSITY）、`ParticipantDraft`、`normalizeLineup(raw: unknown, expertCount: number): { host: ParticipantDraft; experts: ParticipantDraft[] }`
- `core/bid.ts`：`NormalizedBid`（含 participantId、wantToSpeak、intent、urgency、replyToParticipantId、focus）、`normalizeBid(raw: unknown, ctx: { selfId: string; aliasToParticipantId: Record<string, string> }): NormalizedBid`
- `core/scheduler.ts`：`SCHEDULER_WEIGHTS`（常量写完整）、`SchedulerInput`、`SpeakerPick`、`selectNextSpeaker(input): SpeakerPick | null`
- `core/hostPolicy.ts`：`HOST_INTERVAL`、`HostPolicyContext`、`HostDecision`、`decideHostAction(ctx): HostDecision`
- `core/insights.ts`：`InsightPatch`、`MergeContext`、`similarity(a, b): number`、`mergeInsights(current, patch, ctx): { insights: Insight[]; changed: boolean }`
- `core/sentences.ts`：`sanitizeUtterance`、`clampSentences`、`createSentenceLimiter`
- `core/json.ts`：`LLMFormatError`、`parseJsonLoose`
- `core/context.ts`：`buildAliasMap`、`buildTranscriptWindow`、`formatInsightsForPrompt`
- `core/rng.ts`：`createRng(seed: number | string): () => number`（可以直接实现，mulberry32 + 字符串哈希）
- `llm/types.ts`：LLMTask、LLMTier、LLMRequest、LLMProvider、`TASK_ROUTING`（任务 → 档位、temperature、maxTokens，写完整）
- `llm/openaiCompatible.ts`：`createOpenAICompatibleProvider(opts: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch; timeoutsMs?: { quality: number; fast: number } }): LLMProvider`
- `llm/mock.ts`：`createMockProvider(opts?: { latencyMs?: number; streamDelayMs?: number; failOn?: (req: LLMRequest) => boolean }): LLMProvider`
- `llm/gateway.ts`：`createLLMGateway(opts: { provider: LLMProvider; models: { quality: string; fast: string }; maxConcurrency: number; logger?: (line: string) => void })` → `{ providerName, models, complete(req), stream(req) }`（按 TASK_ROUTING 选模型、并发限制、重试）
- `prompts/index.ts`：`buildLineupPrompt`、`buildBidPrompt`、`buildUtterancePrompt`、`buildHostPrompt`、`buildInsightsPrompt`、`buildSummaryPrompt`（返回 `{ system, user, context }`）
- `engine/eventBus.ts`：`createEventBus(db)` → `{ publish(event), subscribe(discussionId, listener): () => void, viewerCount(discussionId), closeDiscussion(discussionId) }`。持久事件先写库获得 seq 再广播；listener 收到 `{ event, seq }`（瞬时事件 seq 为 null）。
- `engine/runner.ts`：`DiscussionRunner`（构造参数：db、bus、llm、config（maxTurns、pacingMs）、discussionId、rng?；方法：`start()`、`pause()`、`resume()`、`requestEnd()`、`stop()`、`getLiveUtterance()`；属性 `done: Promise<void>`）
- `engine/manager.ts`：`DiscussionManager`（`start`、`pause`、`resume`、`end`、`remove`、`recoverOnBoot`、`getLiveUtterance`、`stopAll`）
- `routes/discussions.ts`、`routes/stream.ts`：`createDiscussionsRouter(deps)`、`createStreamRouter(deps)`
- `app.ts`：扩展为 `createApp(deps: { config; db; llm; bus; manager })` 并挂载上述路由，保留已有 health 行为。若因此需要调整已有的 `app.test.ts`，同步修改但保持原断言语义。

## 3. 必须覆盖的测试（规则细节以 `docs/ARCHITECTURE.md` 为准；测试名用中文描述行为）

**core/lineup.test.ts**
1. 合法输入：1 主持人 + N 专家；seat 0..N；主持人颜色 `#E8C872`，专家颜色按 `EXPERT_PALETTE` 顺序且互不相同；avatar 为姓名首字；role 正确
2. 专家多于 N：只保留前 N 位
3. 专家少于 N：`INSUFFICIENT_EXPERTS`
4. 姓名重复（专家之间或与主持人）：`DUPLICATE_NAMES`
5. N ≥ 2 且所有专家 stanceTag 相同：`LOW_DIVERSITY`
6. 修剪空白；超长字段按 FIELD_LIMITS 截断；缺 stanceTag → “观点”；缺 persona → ""
7. host 缺失、experts 不是数组、必填字段为空：`INVALID_FORMAT`
8. 输入不是对象（null、字符串）：`INVALID_FORMAT`

**core/bid.test.ts**
1. 合法出价：replyTo 别名映射为 participantId
2. intent 非法 → raise_hand；wantToSpeak 非布尔 → false
3. urgency："0.7" → 0.7；1.5 → 1；-1 → 0；"abc" → 0.5
4. replyTo 未知别名或指向自己 → null
5. focus 超过 40 字截断并以“…”结尾（总长 ≤ 40）；空白 → null
6. 非对象输入 → 默认不发言出价

**core/scheduler.test.ts**（除特别说明，rng = () => 0）
1. 无人想发言且无被点名者 → null
2. 上一位发言人（专家）即使出价最高也被排除
3. 上一条是主持人时不排除任何专家
4. 直接反驳上一位发言人的出价，胜过 urgency 相同的普通举手
5. urgency ≥ 0.8 的抢答胜过 urgency 0.7 的直接反驳
6. 最近发言惩罚：在 recentExpertSpeakerIds 中的专家在同等出价下落后
7. 公平加成：从未发言的专家在同等出价下胜出
8. 被点名的专家即使没有出价也被视为举手（urgency 0.5），并因点名加成胜过普通举手
9. urgency 0.9 的抢答可以抢过被点名者（构造时让双方公平加成相同）
10. 两个完全相同的出价由 rng 决定胜者；相同 rng 序列结果确定
11. 返回值含 participantId、intent、replyToParticipantId、score，score 与公式一致（toBeCloseTo）
12. 非机械轮流（模拟）：用 `createRng(42)` 生成 30 轮随机出价，循环调用并维护 lastSpeaker / recent / lastSpokeTurn，断言：没有连续相同发言人；发言序列不等于按 seat 轮转的序列；不存在周期为 N 的固定循环

**core/hostPolicy.test.ts**
1. 上一条是主持人 → experts
2. noBidders → invite speakCount 最少者（并列取 seat 最小）
3. 距上次主持人发言 ≥ 3 条专家发言且有涉及 ≥ 2 名专家的 active 分歧 → bridge：取 updatedAtSeq 最大的分歧，目标为其中非上一位发言人且 speakCount 最少者
4. 距上次主持人发言 ≥ 3 条且无 active 分歧（或分歧已 resolved）→ follow_up 上一位专家
5. 有 speakCount = 0 的专家且 turnCount ≥ expertCount + 1 → invite（多人取 seat 最小）
6. turnCount 未达阈值时，即使有人未发言也返回 experts
7. 优先级：noBidders 优先于 HOST_INTERVAL 规则

**core/insights.test.ts**
1. 新共识（≥ 2 名专家、证据有效）→ 新增，updatedAtSeq = currentSeq，status active
2. ref 命中 → 更新原条目且 id 不变，evidence 合并去重
3. 无 ref 但内容与已有条目高度相似 → 更新而不是新增
4. 未知别名、主持人别名 H 被丢弃；丢弃后不足 2 人 → 整条丢弃
5. evidence 中不存在的 seq 被过滤；全部被过滤 → 整条丢弃
6. 分歧 resolved: true → status 'resolved'
7. 补丁未提及的已有条目保持不变
8. 每类超过 maxPerKind → 保留 updatedAtSeq 最新的条目
9. 空补丁或非法补丁 → 原样返回且 changed = false
10. similarity：完全相同 → 1；完全不同 → 0；忽略标点与空白

**core/sentences.test.ts**
1. clampSentences：中文三句 → 前两句
2. 不在小数点处断句（“增长了 3.5 个百分点。”算一句）
3. 省略号、问号、感叹号以及后随右引号（“！”）保持完整
4. 无句末标记且超过 120 字 → 截断为 120 字 + “…”
5. sanitizeUtterance：去掉「张三：」「【张三】」「**张三**：」「主持人：」前缀、整体包裹的引号、Markdown 符号、换行
6. 不误删正文中的冒号（“我的观点是：……”保持不变）
7. createSentenceLimiter：分片输入时最多输出 max 句；done 标志正确；达到上限后再 push 不输出；不输出发言人前缀；所有输出拼接后等于 clampSentences(sanitizeUtterance(全文)) 的前缀

**core/json.test.ts**：纯 JSON；```json 围栏；前后有说明文字；非法输入抛 `LLMFormatError`

**core/context.test.ts**
1. buildAliasMap：主持人 H，专家按 seat 为 E1..En
2. buildTranscriptWindow：只取最近 k 条，按时间正序，格式 `#seq 别名 姓名（Title）：内容`
3. formatInsightsForPrompt：共识 C1..、分歧 D1..，分歧含各方立场，resolved 标“（已化解）”

**llm/openaiCompatible.test.ts**（fake fetch，不访问网络）
1. complete（json 任务）：URL = baseUrl + `/chat/completions`；`Authorization: Bearer` 头；body 含 model、messages（system + user）、temperature、max_tokens、`response_format: { type: 'json_object' }`；返回 content
2. complete 忽略 `message.reasoning_content`
3. stream：用 ReadableStream 模拟 SSE 分片（含跨 chunk 的半行、reasoning_content 增量、content 增量、`[DONE]`），只产出 content 增量，拼接正确
4. 429 后重试一次成功；连续失败时抛错，错误信息不含 apiKey
5. 超时：fetch 永不返回时，在配置的（很短的）超时后抛错

**llm/mock.test.ts**
1. 相同输入（discussionId、task、调用序号）输出相同
2. lineup 输出可被 parseJsonLoose 解析并通过 normalizeLineup（expertCount 2..6 都要测）
3. bid 输出可被 normalizeBid 规范化
4. insights：context 含反驳关系时产出分歧，含补充关系时产出共识，且 evidence 指向 context 中的 seq
5. stream 分片拼接 = complete 文本；utterance / host / summary 为中文自然语言、不以 `{` 开头
6. failOn 命中时抛错

**llm/gateway.test.ts**
1. 按 TASK_ROUTING 选模型：lineup / summary → quality，其余 → fast
2. maxConcurrency = 2 时同时进行的调用不超过 2
3. JSON 任务把 json: true 透传给 provider

**engine/runner.test.ts**（mock LLM、测试库、maxTurns = 8、pacing 0）
1. 完整跑完：状态 live → summarizing → ended；第 1 条发言是主持人 opening，最后 1 条是主持人 closing；正文发言数 = maxTurns；summary 非空；turn_count = maxTurns
2. 没有同一专家连续两条发言
3. 专家发言与主持人插话 ≤ 2 句，opening ≤ 3 句
4. summary.completed 之前至少有一次 insights.updated，结束时 insights 非空
5. summary 是自然语言：不以 `{` 或 `[` 开头，JSON.parse 失败
6. 每个 utterance.completed 之前都有同 utteranceId 的 utterance.started；participant.state 中 speaking 只出现在当时的发言人身上
7. 至少出现 1 次主持人插话（follow_up / bridge / invite）
8. 专家发言的 act 至少有 2 种
9. pause 后最多再完成 1 条发言就停止增长；resume 后继续直至结束
10. requestEnd：直播中调用后进入 summarizing 并最终 ended，正文发言数 < maxTurns
11. 故障注入：发言任务持续失败时，连续 3 轮失败后状态变为 paused 并推送 error 事件，进程不崩溃
12. 所有事件 JSON 中不出现 "reasoning" 字样

**engine/isolation.test.ts**
1. 同时启动两个讨论并跑完：A 的所有事件 discussionId = A；A 的发言 participantId 都属于 A 的阵容；B 同理；insights 不含对方参与者；events seq 各自从 1 连续；两边 transcript 不同

**routes/api.test.ts**（supertest）
1. POST 校验：空话题、1 字、201 字、expertCount 为 1 / 7 / 非整数 → 400 VALIDATION_ERROR，message 为中文
2. 创建成功 → 201，status = lineup_ready，participants 为 1 + 4（默认），颜色与头像已分配
3. GET 列表包含新讨论与 6 条 seed；排序符合 STATUS_PRIORITY；`?status=ended` 过滤正确
4. GET 详情返回快照；不存在 → 404 NOT_FOUND
5. regenerate：lineup_ready → 新阵容（participant id 改变）；live 状态 → 409
6. start：lineup_ready → 200 live；重复 start → 409
7. pause / resume / end 的合法与非法转换（例如对 ended 调 pause → 409）
8. DELETE → 204，再 GET → 404
9. 阵容生成失败（mock failOn lineup）→ 502 LLM_ERROR，`details.discussionId` 存在，该讨论 status = failed；恢复后 regenerate → lineup_ready
10. `/api/health` 与上述所有响应文本都不含配置的假 Key

**routes/stream.test.ts**（真实 HTTP 服务，随机端口）
1. content-type 为 text/event-stream；先收到 viewers.updated（viewerCount ≥ 1）
2. 对 seed 中 ended 讨论用 since=0 连接：补发全部持久事件，seq 递增且每条带 id
3. since=N 只补发 seq > N 的事件；Last-Event-ID 头优先于 since
4. 讨论不存在 → 404 JSON
5. 两个连接时 viewerCount = 2；断开一个后变为 1
6. 直播中的讨论能实时收到 utterance.started / utterance.delta / utterance.completed

## 4. 测试工具

- `server/src/test/helpers.ts`：`createTestDb({ seed? })`（`:memory:` + initSchema，可选 seed）、`createTestConfig(overrides)`、`readSse(url, { headers?, until, timeoutMs })`（用 fetch 读流并解析 SSE 帧，返回事件数组）、`waitFor(predicate, timeoutMs)`
- 引擎和路由测试使用 mock 提供商：pacing 0、mock 延迟 0、流式间隔 0、maxTurns = 8
- 测试不访问网络；openaiCompatible 测试使用 fake fetch

## 5. 验证

- `npm run typecheck -w @aps/server` 必须通过（桩签名完整、测试类型正确）。
- `npm test -w @aps/server`：之前阶段的测试（config、connection、app、db/**）仍全部通过；新增测试失败，且失败原因是 NOT_IMPLEMENTED。报告新增用例总数、失败数、失败原因分布；若有新测试意外通过或因其他原因失败，逐个说明。

## 6. 报告

文件清单（桩 / 测试 / 文档）；每个测试文件的用例数；验证结果；你认为规格中难以测试或存在歧义的规则（列出并给出你在测试中采用的解释）。
