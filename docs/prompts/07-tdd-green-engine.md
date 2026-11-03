# 【TDD 阶段 · Prompt 07】Green（二）：事件总线、讨论引擎、REST 与 SSE，及整场真实联调

| 项 | 内容 |
|---|---|
| 范式 | TDD Green 步（第二部分）+ 后端集成：让 engine / routes 测试变绿，再用 mock 与真实 DeepSeek 各跑完整场讨论 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`、`docs/ARCHITECTURE.md`（§3、§4、§7、§8、§9）、`docs/API.md`（全部）、`docs/PRD.md`（验收标准）、`docs/TEST-PLAN.md`、`docs/RUNTIME-PROMPTS.md`、`server/src/engine|routes` 的桩与测试、已实现的 core / llm / prompts / db |
| 产出 | `server/src/engine/**`、`server/src/routes/**`、`server/src/app.ts`、`server/src/index.ts` 及补充测试；联调记录放在仓库外 `C:\Users\123\Desktop\mianshiti\_review\live\` |
| 约束 | 不改 `shared/`、`web/`；core / llm / prompts 只修 bug（必须附回归测试并在报告说明）；不安装依赖；不读取 `server/.env` |

> 为什么引擎单独一步：引擎负责把纯规则、LLM 和数据库编排成一场“有节奏、可暂停、可恢复、互不串台”的直播，难点在并发与一致性，不在单个规则。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md`；完整读 `docs/API.md` 与 `docs/ARCHITECTURE.md` 的 §3、§4、§7、§8、§9；再读 `docs/TEST-PLAN.md`、`docs/RUNTIME-PROMPTS.md`，以及 `server/src` 下 engine、routes 的桩与测试和已实现模块。
- 本阶段没有其他子代理并行。前端（`web/`）已接入真实 API 并单独验证、提交；本阶段不改 web/，验证只运行 `-w @aps/server` 的命令。

## 1. 规则

- 与 Prompt 06 相同：不允许为了变绿而修改断言、跳过测试或放宽容差；确认测试与文档冲突时以文档为准修正，并在报告逐条列出。
- 接口路径、状态码、错误码、响应结构、事件字段一律以 `docs/API.md` 为准；状态转换以 ARCHITECTURE §4.1 和 API.md §5 为准，非法转换返回 `409 INVALID_STATE`。
- 禁止模块级可变状态：RNG、调用计数、洞察队列、暂停信号、AbortController、liveUtterance、主持人策略上下文都是 Runner 的实例字段。
- `reasoning_content` 不得进入任何事件、日志或数据库。

## 2. 实现要点（文档已规定的内容以文档为准，以下是文档未细化之处的决定）

### 2.1 EventBus

- 按 discussionId 分频道。持久事件先写 `events` 表获得 seq 再广播 `{ event, seq }`；瞬时事件 seq 为 null。
- **一致性**：领域写入与对应的持久事件写入必须在同一个事务里完成，提交后再广播。例如“写入 utterance + speak_count + turn_count + 追加 utterance.completed 事件”是一个事务。这样快照与事件日志永远一致。如果桩的 `publish` 签名做不到，可以拆成“事务内持久化”和“提交后广播”两步，并在报告中说明。
- 单个 listener 抛错不能影响其他 listener，也不能影响发布方。
- `closeDiscussion(id)` 通知该频道所有订阅者结束（SSE 据此关闭响应）并清理频道。

### 2.2 DiscussionRunner（主循环见 ARCHITECTURE §3.1）

- 上下文从数据库重建：已有发言、turn_count、speak_count、insights。这样“暂停 → 服务重启 → 继续”也能接着讲；已有发言时不再重复 opening。
- 出价：全体专家并行（`Promise.allSettled`），单个失败视为不发言。每个出价返回后立即推送 participant.state：想发言为 preparing + intent + focus；不想发言为 idle + intent null，focus 可以保留出价返回的公开关注点，让小窗持续有内容。选出发言人后，其余专家回到 idle 并清空 intent。
- 主持人策略上下文按 §5.D 维护：expertTurnsSinceHost、noBidders、addressed、lastSpeakerId、recentExpertSpeakerIds、lastSpokeTurn。bridge 要把对应分歧的内容和双方立场交给 host prompt；invite 的目标写入 addressed。
- 发言按 §3.1 的 `speak()`：预留 seq 与 utteranceId，推送 speaking 与 utterance.started，流式经 `createSentenceLimiter` 推送 utterance.delta 并更新 liveUtterance，最终文本为 `clampSentences(sanitizeUtterance(全文))`。最终文本为空时按发言失败处理。
- 洞察队列：每条正文发言完成后触发；串行执行；运行中再次触发时合并为一次后续运行；每次处理“上次成功处理之后的所有新发言”；`changed = true` 时在同一事务里 `replaceAll` 并追加 insights.updated。总结开始前等待队列清空（包括最后一次触发）。
- pacing 的 sleep 必须能被 pause、end、stop 打断。暂停语义以 API.md §3.7 为准：当前发言完成后停在循环检查点。
- 失败处理严格按 ARCHITECTURE §8.2（出价、全部出价失败计为失败轮次、发言、连续 3 轮失败转 paused、洞察、总结兜底模板、阵容重试时把校验错误反馈给模型）。
- 流式发言时，句子限流器一旦 `done`，立即中止该次 LLM 流（AbortController），不再等待模型把多余内容生成完，以节省时间与 token。
- `stop()` 中止进行中的 LLM 请求（AbortController），供删除讨论和进程退出使用。

### 2.3 DiscussionManager

- `Map<discussionId, DiscussionRunner>`。对 paused 且内存中没有 Runner 的讨论（例如服务重启后）：resume 时从数据库重建 Runner 继续；end 时创建 Runner 只执行总结。
- `recoverOnBoot`：`markInterruptedAsPaused()` 之后，为每个受影响的讨论追加一条 `discussion.status(paused)` 持久事件，保证回放时间线完整。
- 阵容生成（创建与换一批）：lineup 任务（quality、JSON）→ `parseJsonLoose` → `normalizeLineup`。校验失败时把错误原因反馈给模型再试 1 次；成功后在同一事务中 `replaceLineup`、更新状态并追加 lineup.updated 与 discussion.status；最终失败时状态为 failed，写 error_message，接口返回 `502 LLM_ERROR`（details 带 discussionId）。
- `remove`：`runner.stop()` → `bus.closeDiscussion` → 删除数据。`stopAll` 用于进程退出。

### 2.4 REST（API.md §3）

- 请求体与查询参数用 `@aps/shared` 的 zod schema 校验；`?status=` 为逗号分隔，非法值返回 400。
- 统一错误中间件：业务错误输出 `{ error: { code, message, details? } }`；zod 错误转 400 VALIDATION_ERROR（中文 message）；非法 JSON 请求体转 400；其余为 500 INTERNAL。任何响应都不含堆栈或配置值。
- 未知的 `/api` 路径返回 404 JSON。保留 `GET /api/health` 的现有行为。

### 2.5 SSE（API.md §4 与 ARCHITECTURE §8.3）

- 严格实现“先订阅并缓冲 → 按游标补发 → 按序冲刷缓冲区（跳过已发送的持久 seq）→ 切换直推”。
- 游标优先级：`Last-Event-ID` 请求头 > `since` 查询参数；都没有时按 API.md §3.11 的规定处理。
- 响应头、`retry: 3000`、持久事件的 `id:` 行、不发送 `event:` 字段、每 15 秒 `: ping`，全部按 API.md §4.1。发送响应头后立即 flush。
- 连接关闭时：取消订阅、清理定时器、广播 viewers.updated。收到 closeDiscussion 时结束响应。

### 2.6 `app.ts` 与 `index.ts`

- `createApp(deps)` 在创建应用时一次性挂载全部路由。Red 阶段的桩为了通过类型检查，在每个请求里新建 router 并按路径后缀分发，这种写法要去掉。
- `index.ts` 的启动顺序：loadDotEnv → loadConfig → openDatabase → initSchema → seedIfEmpty → 选择提供商（ARCHITECTURE §6.2）→ gateway → bus → manager → recoverOnBoot → 监听 `127.0.0.1:PORT`。日志只输出 `describeConfig` 的内容。收到 SIGINT / SIGTERM 时：manager.stopAll → server.close → db.close。mock 提供商使用配置中的 MOCK_LATENCY_MS 与 MOCK_STREAM_DELAY_MS。

### 2.7 运行时 Prompt 的输入与失败日志

- Prompt builder 的输入以 Prompt 06 阶段的最终签名为准（读 `server/src/prompts/index.ts` 与 `docs/RUNTIME-PROMPTS.md`）。Runner 负责从数据库重建并传入：阵容名册（别名、姓名、职业 · Title、立场标签、立场）、出价时的上一条发言及其与本人立场的关系、bridge 对应的分歧（双方姓名与立场）、invite 目标的身份、洞察任务的最近发言窗口与本次新增发言、`validSeqs`（本场全部真实发言 seq）、总结任务的全部发言（最多 40 条，超出时保留开场与最近 39 条，见 ARCHITECTURE §7.1）。
- 任何任务失败时，日志记录任务名、讨论 ID 与错误类别（例如 `bid failed: 大模型响应格式无效`、`insights failed: JSON 解析失败`）。错误消息本身不含 Key 和响应体，可以记录；不要记录模型原文。

### 2.8 编排者审阅 mock 演示与前端接入后补充的要求

1. **每轮的 `discussion.status` 与 `updatedAt`。** 前端标题栏的“第 N / M 轮”只靠 `discussion.status` 事件更新，所以 ARCHITECTURE §3.1 中“turnCount += 1 → 持久化并推送 discussion.status”每轮都要做。前端合并控制接口（start / pause / resume / end）的返回值时，会忽略 `updatedAt` 早于当前状态的响应。因此：状态或 turn_count 变化时，写入的 `updated_at` 与对应 `discussion.status` 事件的 `at` 用同一个时间戳；控制接口返回的是转换后的 discussion 记录；写入总结时 `updated_at` 与 `summary.completed` 的 `at` 也用同一个时间戳。
2. **开场不要点名第一位发言人。** mock 演示里主持人开场说“先请某某从自己的立场说起”，引擎随后由出价选出的却是另一位专家，观众会觉得主持人被无视。第一位发言人由出价决定，所以在 `hostGuidance('opening')` 中加一句“不指定由谁先发言，第一位发言者由嘉宾举手决定”，同步 `docs/RUNTIME-PROMPTS.md`，并给 prompts 测试补一条断言。mock 开场模板里的同类句式在下一阶段统一处理，本阶段不改 `server/src/llm/mock*.ts` 的文本模板；只有 mock 的结构性 bug（例如导致流程卡住）可以修，并附回归测试。
3. **出价 relation 的已知风险。** `previousUtteranceContext` 用 stanceTag 字符串相等判断“相同 / 不同”。阵容 Prompt 要求至少三种立场标签，于是“有条件支持”与“支持”也会被判为“不同”，而出价 system 写着“立场不同且能指出对方具体漏洞时优先 rebut”，出价会偏向反驳。如果真实联调中 supplement 没有出现，或 rebut 占专家发言的 60% 以上，优先修这里，例如按立场方向（偏支持 / 偏反对 / 中立）计算关系，或在出价上下文中同时给出双方的立场原文。若改动了 relation 的取值，`server/src/llm/mock.ts` 中读取 relation 的分支要同步适配并补测试，否则 mock 的出价会全部退化为 raise_hand。

## 3. 验证

1. `npm run typecheck -w @aps/server`。
2. `npm test -w @aps/server` 全部通过。连续运行 2 次，确认没有偶发失败；报告用例总数。
3. **mock 全流程（真实 HTTP + SSE）**：
   - 用 fireAndForget 后台启动服务，在同一条命令里用 PowerShell 设置进程环境变量覆盖配置：`LLM_PROVIDER=mock`、`DATABASE_PATH` 指向仓库外的临时文件、`MAX_TURNS=8`、`PACING_MS=200`、`MOCK_LATENCY_MS=50`、`MOCK_STREAM_DELAY_MS=10`，然后 `npx tsx src/index.ts`（工作目录 server/）。
   - 在仓库外写联调脚本 `C:\Users\123\Desktop\mianshiti\_review\live\run-discussion.mjs`（Node 原生 fetch）：创建讨论 → 开始 → 读 SSE 直到 ended → GET 快照。
   - 检查并打印：各类型事件数量；持久事件 seq 连续；utterance.completed 数量等于快照发言数；没有专家连续发言；专家发言 ≤ 2 句；Transcript 中只有发言（没有举手等内部事件）；summary 为自然语言；全部事件文本中不出现 “reasoning”。
   - 同时跑两场讨论，验证互不串台；在一场讨论中途断开 SSE，再用 Last-Event-ID 重连，验证补发不重复、不遗漏。
   - 控制操作：另起一场，开播后等到第 2 条正文发言完成时调用 pause，等待 3 秒确认没有新的 utterance.completed（当前发言允许先说完），再 resume，随后 end；检查各接口返回的状态与状态码、`updatedAt` 不早于对应 `discussion.status` 事件的 `at`、每轮正文发言后都有 turnCount 递增的 `discussion.status`，以及 end 后依次出现 summarizing → summary.completed → ended。
   - 重启恢复：一场讨论进行中时按 PID 强制结束服务进程，用同一个数据库文件重新启动；确认该讨论变为 paused，时间线末尾有一条 `discussion.status(paused)`；resume 后讨论继续，且不会再出现第二次 opening。
4. **真实 DeepSeek 全流程**：同一脚本，不设置 `LLM_PROVIDER`（让 `server/.env` 里的 Key 生效），`DATABASE_PATH` 用临时路径，`MAX_TURNS=12`，`PACING_MS=800`。话题「AI 编程助手会让初级程序员岗位消失吗？」，4 位专家。
   - 把完整阵容、Transcript（含 act 与回应对象）、洞察、总结和时间线保存到 `C:\Users\123\Desktop\mianshiti\_review\live\deepseek-run-1.md`。
   - 报告：阵容生成耗时、开播后首条专家发言的出现时间、平均每轮耗时、总结耗时、总耗时、洞察数量、act 分布、主持人插话次数，以及质量观察（是否自然、有无真实交锋、有无重复或幻觉、句数是否合规）。
   - 整场质量目标（逐项报告是否达到）：专家发言的 act 至少包含 rebut 与 supplement 各 1 次；出价中至少出现 1 次 interrupt（抢答）；至少 1 次主持人插话（follow_up / bridge / invite）；没有专家连续发言，且各专家发言次数不是机械均匀；第 6 条正文发言之前出现第一条共识或分歧，结束时洞察 ≥ 2 条且至少 1 条分歧；同一句式（例如“补一个条件”）在全场出现不超过 2 次；总结点名至少 2 位专家，并且与洞察区一致，不把未发言嘉宾的立场设定写成“他提到”。
   - 最多跑 3 次真实全流程（控制成本）。未达标时先分析原因：是 Runner 传给 builder 的上下文不对，还是 Prompt 本身的问题。调整 `server/src/prompts/` 时单元测试保持全绿，并同步更新 `docs/RUNTIME-PROMPTS.md`。不得为了达标在代码里硬编码 act 或洞察。
5. 进程环境变量应优先于 `server/.env`（`process.loadEnvFile` 不覆盖已存在的变量）。如果实际不是这样，在报告中说明，不要修改 `.env`。
6. 结束前按 PID 停掉所有服务进程，并确认端口已释放。

## 4. 报告

文件清单；各测试文件用例数与结果；修正过的测试（原断言 → 新断言 → 依据）；mock 联调的检查结果；DeepSeek 联调的耗时与质量观察（附运行记录路径）；与规格的偏差；给前端接入阶段的提示（例如事件时序上的注意点）。

---

## 续派 1（编排者审阅交付后，resume 同一子代理）

编排者复跑了你的 mock 联调脚本（完整流程、两场并发隔离、断线补发、控制操作都通过），并审阅了 eventBus、runner、manager、stream、routes 与 repository 的改动：事务内持久化后再广播、SSE“订阅缓冲 → 补发 → 去重 → 直推”的顺序都正确。还有下面 5 个问题需要修。仍然只改 `server/` 和与之对应的 `docs/RUNTIME-PROMPTS.md`，只运行 `-w @aps/server` 的命令：另一个子代理正在 `web/` 下工作。

1. 【严重】“换一批”与开播的竞态。`POST /:id/lineup/regenerate` 在 `await generateLineup(...)` 期间讨论仍是 `lineup_ready`，这时 `POST /:id/start` 能开播成功；随后 `persistReadyLineup` 替换参与者，运行中的 Runner 持有的旧参与者 ID 全部失效。生成期间删除讨论后再写入阵容，同样会出错。
   - 修改：为“正在生成阵容”的讨论加进程内互斥。规格没有中间状态，不要新增状态值。生成期间 `start` 返回 `409 INVALID_STATE`（message 说明阵容正在更新）；重复的 regenerate 也返回 409。写入新阵容时，在同一事务里重新确认讨论仍存在、状态仍是 `lineup_ready` 或 `failed`，否则丢弃结果：讨论已删除返回 404，状态已变返回 409。无论成功、失败还是抛异常都要释放互斥。创建讨论（`POST /api/discussions`）在生成期间被删除时，同样不能写入孤儿数据或返回 500。
   - 回归测试：用可控的 LLM 替身让 regenerate 挂起。挂起期间 start 返回 409，regenerate 完成后 start 返回 200 且用的是新阵容；挂起期间 DELETE，regenerate 返回 404，数据库里没有该讨论的参与者；挂起期间第二次 regenerate 返回 409；生成失败后互斥已释放。

2. 【体验】总结没有流式输出。`summarize()` 等 `generateSummary()` 收集完全部 chunk 后才发 `utterance.started` 和全部 delta（run-3 记录里所有总结 delta 的时间戳相同）。质量档模型要生成十几到几十秒，这段时间演播厅只看到主持人“发言中”，没有字幕。
   - 修改：边生成边推送。为满足 AC-F7-2（页面不显示 JSON），先缓冲到出现第一个非空白字符：如果是 `{` 或 `[`，这次尝试不推送，按失败处理；否则发 `utterance.started`，把已缓冲的内容和之后的 chunk 实时作为 delta 推送，liveUtterance 同步累积，保证断线重连的快照能看到已生成的部分。如果某次尝试在开始推送之后失败（中途网络错误，或全文最终被判为 JSON 或空），下一次尝试或代码兜底总结要换一个新的 `utteranceId` 重新发 `utterance.started`（前端收到新的 started 会整体替换实时字幕）。最终持久化的 `closing` 发言和 `summary` 只能使用成功那次的全文。
   - 回归测试（runner 层）：stream 替身分段产出，断言第一个 delta 在流结束前已经发布；首字符为 `{` 的尝试不发布任何 delta，最终采用重试结果；中途抛错的尝试之后，重试换了新的 utteranceId，最终内容只来自重试；两次都失败时，兜底总结也按 started → delta → completed → summary.completed 发布。

3. 【质量】正文最后一轮不能是主持人插话。run-3 最后一条正文发言 #13 是主持人的 bridge 提问，接着直接进入总结，问题没人回答。修改 `decideHostAction` 的输入或判断：只剩最后 1 轮正文（`turnCount >= maxTurns - 1`）时只能由专家发言，不选 follow_up、bridge、call_on 等主持动作；这一轮如果无人出价，按现有兜底规则直接安排一位专家发言，而不是让主持人点名提问。补单元测试，并保证 mock 全流程的最后一条正文发言来自专家。

4. 【一致性】mock 开场的点名与实际首位发言人不一致。你已按规格把开场 Prompt 改成“不指定由谁先发言”，但 `server/src/llm/mock.ts` 的 opening 模板第 1 条仍是“先请${firstGuestName}从自己的立场说起”。编排者复跑时，开场点名高嘉禾，第一个发言的却是叶南风。删除这类点名模板，其余模板也不能暗示具体人选，并同步修改 `mock.test.ts` 的相关断言。

5. 【次要】`stopAll()` 只关闭有 Runner 的频道。关闭服务时，让所有 SSE 连接（包括 lineup_ready、ended 等没有 Runner 的讨论）都能结束，避免 `server.close()` 被悬挂的长连接拖住。补测试，或在报告里说明验证方法。

### 验证

1. `npm run typecheck -w @aps/server`；`npm test -w @aps/server` 连续 2 次全绿，报告用例总数。
2. 用 `_review\live\run-discussion.mjs` 重跑 mock 全流程、并发、重连、控制操作与重启恢复（端口用 8796 或 8797，数据库用临时文件）。把下面的新检查写进脚本：最后一条正文发言来自专家；总结的 delta 不全是同一时间戳，且第一个 delta 早于 `summary.completed`；开场文本没有点名某位专家先发言。
3. 真实 DeepSeek 再跑 1 次（第 4 次，记录到 `_review\live\deepseek-run-4.md`），配置同前：`MAX_TURNS=12`、`PACING_MS=800`、同一话题、4 位专家。目的是验证 run-3 之后收紧的 interrupt/rebut 提示和本次修改。报告：总结从 `utterance.started` 到第一个 delta 的耗时、delta 的时间跨度；最后一条正文发言的发言人；act 分布（rebut、supplement、interrupt 等）；“等一下”之类固定插话开头的次数；与 run-3 的对比。只跑这 1 次，不达标也不要重跑，在报告里分析原因并给出建议。
4. 结束前按 PID 停掉所有服务进程，确认端口已释放。

约束不变：不读取、打印或修改 `server/.env`；不安装依赖；不改 `shared/`、`web/`、`docs/prompts/`；不提交 git。报告：改动文件、每项修复的做法与对应测试、修正过的测试断言及依据、mock 联调结果、DeepSeek 第 4 次运行的数据与观察、遗留问题。

---

## 续派 2（编排者审阅续派 1 并提交 d6aabc4 后，resume 同一子代理）

续派 1 的 5 项修复已审查通过并提交（d6aabc4）。编排者复跑了根目录 typecheck 与 `npm test`（shared 11、server 185、web 55 全绿），用你的脚本重跑 mock 全流程（含新增 3 项检查）全部通过，也通读了 run-4：总结流式、最后一条正文来自专家、讨论质量都达到预期。还剩下面两个问题。规格已由编排者先行修订；本次除 `docs/RUNTIME-PROMPTS.md` 外不改 `docs/` 下的文件，发现规格仍有矛盾时在报告中指出。

### 1. 【体验】“换一批”失败会毁掉一套可用的阵容

现状：讨论处于 `lineup_ready` 时调用 regenerate，模型最终失败后讨论变为 `failed` 并写入 error_message。前端 `regenerate()` 失败时保留旧阵容，“确认阵容，进入演播厅”只看本地快照的 `lineup_ready`，仍然可以点；用户一点就收到 409，“重试进入演播厅”也会一直 409，只有再换一批成功才能继续。规格本身也矛盾：API.md §5 状态表和 ARCHITECTURE §4 状态图都没有 `lineup_ready → failed`。

已修订的规格：API.md §3.5 末段与 §3.6 的“可能错误”、PRD F2 交互要点与新增的 AC-F2-7、TEST-PLAN 的 AC-F2-7 行、ARCHITECTURE §7.1 第 4 条。要求：

- 从 `lineup_ready` 换一批最终失败：返回 `502 LLM_ERROR`，`details` 仍带 `discussionId`，message 为「换一批失败，已保留当前阵容，可以重试或直接确认开播」；讨论保持 `lineup_ready`，参与者、`error_message`、`updated_at` 都不变，不追加任何事件；互斥照常释放。
- 从 `failed` 重新生成仍失败、创建讨论时失败：保持现状。
- 回归测试（`server/src/routes/api.test.ts`，标题用「待开播讨论换一批失败时保留原阵容与状态且仍可开播」，TEST-PLAN 已按此标题映射）：先成功创建，再让 lineup 任务失败并调用 regenerate，得到 502，校验 code、message 与 `details[0].discussionId`；随后取快照：状态 `lineup_ready`、参与者 ID 与失败前完全相同、`errorMessage` 为 null、`lastEventSeq` 不变；再调用 start 得到 200，状态 `live`，参与者仍是原阵容。现有的「阵容失败保留 failed 状态和讨论 ID 且之后可重新生成」保持通过。
- 前端不用改：失败时页面保留旧阵容并显示服务端 message；Prompt 09 的 E2E 会用路由拦截覆盖这一点。

### 2. 【质量】真实模型下，抢答要么泛滥要么消失

数据：run-3 的写法（“上一位专家刚发言且存在具体、迫切的核心冲突时选 interrupt”）让模型把所有即时反驳都标成 interrupt：interrupt 3 次、rebut 0 次，还有 3 次“等一下”起句。收紧后 run-4 约 40 次出价没有一次 interrupt。只改措辞会在两个极端之间摆动，所以改为“代码管额度，Prompt 给可操作的条件”。已修订的规格：ARCHITECTURE §3.1 伪代码、§5.B 最后一条、§7.1 第 1 条，PRD 术语表。

- 引擎兜底：每场 `interrupt` 正文发言最多 `max(1, floor(maxTurns / 6))` 次（MAX_TURNS 为 12 或 16 时是 2 次）。额度用完，或上一条正文发言的 act 就是 `interrupt` 时，把本轮出价中的 `interrupt` 改为 `rebut`，其他字段不变；改写放在推送 `participant.state` 之前，保证小窗意图与正文 act 一致。判断写成 `server/src/core` 下的纯函数并单测：额度计算、额度用完、上一条是 interrupt、主持人插话后恢复、允许抢答时原样保留。runner 测试至少覆盖：额度用完后 interrupt 出价以 rebut 发言，且 `participant.state` 的 agentIntent 也是 rebut；不会出现两条相邻正文都是 interrupt。
- 出价 Prompt：
  - 删去让模型永远不选 interrupt 的表述（“延后到正常回应会造成误解或遗漏关键条件时才选择”“不得因急于表达而抢答”“偶发而非常态”等），改成可操作的条件：上一条是专家发言；你与它的方向关系是“方向相反”，或它直接否定了你的核心立场；你有一个具体的反驳点，urgency ≥ 0.85；本轮允许抢答。同时满足时用 interrupt，表示要立刻接话；其余具体反驳用 rebut。
  - 用户消息增加一行，例如「本场抢答：已用 N 次，上限 M 次；本轮可以抢答」或「本轮不能抢答（额度已用完 / 上一条已是抢答）」；不能抢答时明确要求不用 interrupt。同样的信息放进结构化 context（mock 读取的是 context，新增字段不影响现有 mock；mock 是否使用它由 06e 决定）。
  - 本场还没有抢答时，是否加“满足条件时优先用 interrupt”的提示，由你根据真实运行结果判断，并在报告里说明。
  - 发言 Prompt 中 interrupt 的指导保留“避免固定插话开头”。
- 同步 `docs/RUNTIME-PROMPTS.md`：出价模板、输入说明和这次调整的原因。
- 不要修改 `server/src/llm/mock*`：mock 由随后的 06e 单独处理，引擎改写也会兜底 mock 的抢答次数。如果现有 runner 测试因为依赖连续抢答而失败，修改测试断言，并在报告里写明依据。

### 验证

1. `npm run typecheck -w @aps/server`；`npm test -w @aps/server` 连续 2 次全绿，报告用例总数。
2. 用 `_review\live\run-discussion.mjs` 重跑 mock 全流程、并发、重连、控制操作与重启恢复（端口 8796 或 8797，临时数据库）。在 qualityChecks 里加入：interrupt 正文条数不超过额度；没有两条相邻正文都是 interrupt；每条 interrupt 正文之前，同一专家在 `participant.state` 中的意图也是 interrupt。
3. 真实 DeepSeek 跑第 5 次（记录到 `_review\live\deepseek-run-5.md`），配置同前：`MAX_TURNS=12`、`PACING_MS=800`、同一话题、4 位专家。目标：interrupt 正文 1–2 条；rebut ≥ 1；supplement ≥ 1；“等一下”之类固定插话开头至多 1 次；run-4 已达到的检查仍然达到。报告 interrupt、rebut、supplement、raise_hand 各自的出价数与正文数，被引擎改写的出价数，以及与 run-3、run-4 的对比。run-5 没有达到 interrupt 目标时，可以针对原因调整一次 Prompt，再跑第 6 次（`deepseek-run-6.md`）；第 6 次无论结果如何都停止，在报告中分析原因并给出建议。
4. 结束前按 PID 停掉所有服务进程，确认端口已释放。

约束：不读取、打印或修改 `server/.env`；不安装依赖；只改 `server/`（不含 `server/src/llm/mock*`）、`docs/RUNTIME-PROMPTS.md` 和 `_review\live\` 下你自己的脚本；不改 `shared/`、`web/`、`docs/prompts/` 和其他规格文档；不提交 git。报告：改动文件、两项修复的做法与对应测试、修正过的测试断言及依据、mock 联调结果、DeepSeek 运行数据与观察、遗留问题。
