# AI Panel Studio 测试计划

本计划以 `docs/PRD.md` 的验收标准为需求入口，以 `docs/ARCHITECTURE.md` §5 A–H 和 §5.1 固定权重表为后端纯函数的唯一行为依据，以 `docs/API.md` 为 REST / SSE 契约依据。测试名使用简体中文描述行为；实现不得以测试计划替代上游规格。

## 1. 测试分层

| 层级 | 覆盖范围 | 方法与边界 |
|---|---|---|
| 单元 | `server/src/core/` 纯函数、句子与 JSON 规则；LLM 任务路由和提供商边界 | Vitest；输入显式、注入 RNG；OpenAI 兼容提供商使用 fake `fetch` 与内存 `ReadableStream`，不访问网络。 |
| 集成 | Runner、讨论隔离、REST、SSE 与 SQLite | Vitest + `node:sqlite` `:memory:` + repository/schema fixtures + mock LLM；SSE 使用随机本地端口。只检查可观察的公开事件、持久状态和共享契约。 |
| E2E | 浏览器中的大厅、阵容确认、直播、控制、回放与响应式布局 | Playwright，后续 E2E 阶段实现；使用 mock LLM，不依赖外网或真实 API Key。 |

## 2. 需求 → 测试映射

| PRD 验收标准 | 单元 / 集成测试映射 | E2E 映射 |
|---|---|---|
| AC-F1-1 | `server/src/routes/api.test.ts`：「列表包含新讨论和结构性种子记录并按状态排序且支持 ended 过滤」 | 大厅按三个状态分组展示全部状态，并将暂停讨论标为「已暂停」。 |
| AC-F1-2 | `server/src/db/repositories/repositories.test.ts`：「sorts by status and updatedAt, filters statuses, and maps list aggregates」 | 同组讨论按 `updatedAt` 倒序显示。 |
| AC-F1-3 | `server/src/routes/stream.test.ts`：「直播讨论能够接收发言开始增量和完成事件」 | 观察直播讨论可接收实时更新，且观察不改变讨论状态。 |
| AC-F1-4 | `server/src/routes/api.test.ts`：「创建成功后返回默认四位专家及已分配角色颜色和头像」 | 首页新建入口显示话题与专家人数输入界面。 |
| AC-F2-1 | `server/src/routes/api.test.ts`：「拒绝空话题越界长度和非法专家人数并返回中文校验错误」 | 表单错误可见、易理解且不离开新建流程。 |
| AC-F2-2 | `server/src/routes/api.test.ts`：「创建成功后返回默认四位专家及已分配角色颜色和头像」 | 省略专家人数后确认页显示四名专家。 |
| AC-F2-3 | `server/src/core/lineup.test.ts`：「按专家人数生成主持人和连续座位并分配角色头像与颜色」；`server/src/routes/api.test.ts`：「创建成功后返回默认四位专家及已分配角色颜色和头像」 | 确认页展示指定人数的结构化嘉宾卡片及专属颜色。 |
| AC-F2-4 | `server/src/routes/api.test.ts`：「待开播讨论换阵容后参与者 ID 改变而直播状态换阵容返回冲突」 | 选择「换一批」后仍可确认新阵容。 |
| AC-F2-5 | `server/src/routes/api.test.ts`：「阵容失败保留 failed 状态和讨论 ID 且之后可重新生成」 | 失败显示中文提示并可在不重填话题时重试。 |
| AC-F2-6 | `server/src/core/json.test.ts`：「解析纯 JSON 对象」「解析带 json 标记的代码围栏」；`server/src/routes/api.test.ts`：「创建成功后返回默认四位专家及已分配角色颜色和头像」 | 页面显示嘉宾信息而不是模型 JSON 原文。 |
| AC-F2-7 | `server/src/routes/api.test.ts`：「待开播讨论换一批失败时保留原阵容与状态且仍可开播」 | 换一批请求失败（路由拦截返回 502）后仍显示原阵容和中文错误，「确认阵容，进入演播厅」可以进入演播厅。 |
| AC-F3-1 | `server/src/engine/runner.test.ts`：「完整运行后从直播经总结结束且开场收尾与正文计数符合上限」；`server/src/routes/api.test.ts`：「开播仅允许 lineup_ready 且重复开播返回冲突」 | 确认阵容后状态进入直播，第一条 Transcript 发言为主持人开场。 |
| AC-F3-2 | `server/src/core/scheduler.test.ts`：「上一位专家即使出价最高也不能连续发言」「紧急度相同时直接反驳上一位发言人的出价胜过普通举手」「三十轮中按出价形成非机械且无固定座位周期的发言序列」；`server/src/core/hostPolicy.test.ts`：「上一条发言来自主持人且上一轮无人出价时仍邀请最少发言专家」；`server/src/engine/runner.test.ts`：「连续两条专家发言不会由同一专家完成」「开场后首轮无人出价时主持人点名并继续至正常结束」 | 观察多轮对话可见由观点与出价驱动的非机械轮转。 |
| AC-F3-3 | `server/src/engine/runner.test.ts`：「每条完成事件之前先有同 ID 的开始事件且 speaking 只标记当前发言人」；`server/src/routes/stream.test.ts`：「直播讨论能够接收发言开始增量和完成事件」 | 字幕展示增量，收到完成事件后以最终文本替换。 |
| AC-F3-4 | `server/src/engine/runner.test.ts`：「暂停后至多完成当前一条发言并在继续后恢复至结束」「连续三轮出价任务失败后暂停广播错误且不新增正文发言」；`server/src/routes/api.test.ts`：「暂停继续和结束遵守状态转换并拒绝结束态暂停」 | 暂停等待当前发言结束，继续后恢复讨论。 |
| AC-F3-5 | `server/src/engine/runner.test.ts`：「完整运行后从直播经总结结束且开场收尾与正文计数符合上限」「直播中请求结束会进入总结并以少于上限的正文发言数结束」；`server/src/routes/api.test.ts`：「暂停继续和结束遵守状态转换并拒绝结束态暂停」 | 达到上限或用户结束后出现总结并进入回放。 |
| AC-F3-6 | `server/src/core/sentences.test.ts`：「中文句子超过上限时只保留前两句」「英文小数点不被误判为句末」「省略号问号感叹号和紧随的右引号均保持完整」；`server/src/engine/runner.test.ts`：「专家和主持人插话最多两句且主持人开场最多三句」 | 开场不超过三句，正文专家及主持人插话不超过两句。 |
| AC-F4-1 | `server/src/engine/runner.test.ts`：「每条完成事件之前先有同 ID 的开始事件且 speaking 只标记当前发言人」 | `participant.state` 到达时对应专家状态小窗立即更新。 |
| AC-F4-2 | `server/src/core/bid.test.ts`：「关注点修剪并限制为四十字且空白变为空值」 | 小窗显示合法意图与非空关注点，不显示空关注点。 |
| AC-F4-3 | `server/src/llm/openaiCompatible.test.ts`：「完成响应只返回 content 并丢弃 reasoning_content」「thinking disabled 时发送禁用标记及 temperature 和 max_tokens」「thinking low 时启用推理模式并省略 temperature」「未提供 thinking 时请求体不包含 thinking 和 reasoning_effort」；`server/src/llm/gateway.test.ts`：「按任务路由模型并将 thinking temperature 和 maxTokens 透传」；`server/src/engine/runner.test.ts`：「持久与瞬时事件载荷均不包含 reasoning 字样」；`server/src/routes/api.test.ts`：「健康检查与 REST 响应中不泄漏配置的假密钥」 | 检查前端资源、API、SSE、Transcript 与日志中均没有密钥或隐藏推理内容。 |
| AC-F5-1 | `server/src/engine/runner.test.ts`：「总结完成前至少推送一次洞察更新且结束时存在洞察」；`server/src/core/insights.test.ts`：「有效的新共识至少含两位专家和证据并成为当前序号的活跃条目」 | 讨论结束前显示持续更新的共识与分歧。 |
| AC-F5-2 | `server/src/core/insights.test.ts`：「丢弃未知别名和主持人别名且不足两名专家的洞察不入库」「过滤不存在的证据序号并丢弃过滤后没有证据的洞察」 | 无效洞察不出现在界面。 |
| AC-F5-3 | `server/src/core/insights.test.ts`：「有效分歧补丁标记已化解时更新为 resolved」；`server/src/core/context.test.ts`：「分别按创建顺序编号共识与分歧并列出立场和已化解标记」 | 已化解的分歧显示「已化解」。 |
| AC-F5-4 | `server/src/engine/runner.test.ts`：「洞察提炼失败不阻塞主循环且下一次触发包含遗漏发言」 | 洞察请求失败时讨论继续，后续洞察更新补入遗漏发言。 |
| AC-F6-1 | `server/src/engine/runner.test.ts`：「每条完成事件之前先有同 ID 的开始事件且 speaking 只标记当前发言人」；`server/src/db/repositories/repositories.test.ts`：「inserts, lists, counts, sequences, and isolates utterances」 | Transcript 使用最终发言文本、顺序及对应嘉宾身份/颜色。 |
| AC-F6-2 | `server/src/engine/runner.test.ts`：「专家状态和出价事件不会被写成 Transcript 发言」；`server/src/routes/stream.test.ts`：「直播讨论能够接收发言开始增量和完成事件」 | 出价与内部意图只更新状态小窗，不新增 Transcript 条目。 |
| AC-F6-3 | `server/src/db/seed.test.ts`：「builds a schema-valid snapshot for every seed discussion」；`server/src/db/repositories/repositories.test.ts`：「inserts, lists, counts, sequences, and isolates utterances」 | 中途加入回看时，历史发言按时间顺序呈现。 |
| AC-F7-1 | `server/src/engine/runner.test.ts`：「完整运行后从直播经总结结束且开场收尾与正文计数符合上限」 | 收到总结后显示自然语言总结并结束。 |
| AC-F7-2 | `server/src/engine/runner.test.ts`：「模型总结返回 JSON 时不展示 JSON 原文而保存自然语言总结」 | 不显示以 `{` / `[` 开头或可被解析为 JSON 的总结。 |
| AC-F7-3 | `server/src/engine/runner.test.ts`：「总结连续失败时根据讨论内容生成自然语言兜底总结」 | 连续两次总结失败后仍可回看自然语言兜底总结。 |
| AC-F8-1 | 客户端导出不属于本阶段 server 测试范围。 | 导出的 Markdown 含话题、嘉宾、Transcript、洞察与总结。 |
| AC-F8-2 | `server/src/db/repositories/repositories.test.ts`：「inserts, lists, counts, sequences, and isolates utterances」提供按序 Transcript 数据基线。 | Markdown 按 `seq` 排序，且不包含内部意图、隐藏推理或密钥。 |

## 3. 核心规则覆盖索引

下列规则均以 `docs/ARCHITECTURE.md` §5 A–H 为准；固定数值与权重还须符合 §5.1。

| 规格规则 | 测试 |
|---|---|
| A. 阵容字段清洗、截断、专家人数、多样性、重名、颜色、座位和头像 | `server/src/core/lineup.test.ts` |
| B. 出价默认值、意图、布尔值、紧急度、回应别名和关注点 | `server/src/core/bid.test.ts` |
| C. 直接回应、抢答、最近发言、公平、点名、随机扰动、并列裁决与非轮转 | `server/src/core/scheduler.test.ts`；权重由 `server/src/core/scheduler.ts` 的 `SCHEDULER_WEIGHTS` 明确导出 |
| D. 主持人优先级、间隔、分歧串联、未发言邀请与 seat 并列规则 | `server/src/core/hostPolicy.test.ts`，含上一条为主持人时 `noBidders` 仍优先邀请的用例 |
| E. 洞察有效专家与证据、引用更新、模糊相似度、解决状态、保留及上限裁剪 | `server/src/core/insights.test.ts` |
| F. 发言人前缀、整体引号、Markdown、空白、小数点、句末符号、120 字兜底及流式限句 | `server/src/core/sentences.test.ts` |
| G. 角色别名、最近窗口、按时间正序、洞察编号与化解标记 | `server/src/core/context.test.ts` |
| H. 纯 JSON、代码围栏、前后说明文字与格式错误 | `server/src/core/json.test.ts` |
| LLM 任务档位、思考模式、温度、maxTokens 透传、并发与 JSON 标志 | `server/src/llm/gateway.test.ts` |
| OpenAI 兼容请求、思考模式字段映射、Reasoning 丢弃、SSE 分片、重试、密钥保护与超时 | `server/src/llm/openaiCompatible.test.ts` |
| Mock 确定性、任务结构、真实关系证据、流式一致性与故障注入 | `server/src/llm/mock.test.ts` |
| 讨论运行、暂停/结束、抢答额度、洞察重试、错误恢复及并行隔离 | `server/src/engine/runner.test.ts`、`server/src/engine/isolation.test.ts` |
| REST 状态、输入校验、错误响应、删除与密钥边界 | `server/src/routes/api.test.ts` |
| SSE 首事件、事件补发游标、重连优先级、观众数与实时片段 | `server/src/routes/stream.test.ts` |

## 4. Mock LLM 策略与故障注入

- 单元和集成测试均使用本地 mock 提供商；讨论引擎测试配置 `maxTurns = 8`、`pacingMs = 0`、mock 延迟与流间隔为 `0`。特殊暂停测试通过首条正文完成事件触发控制，避免依赖真实时间窗口。
- Mock 内容依 `discussionId + task + 调用序号` 确定；验证 JSON 任务时仍通过 `parseJsonLoose` 和领域规范化函数，避免绕过真实校验路径。
- 故障注入使用 `createMockProvider({ failOn })` 或具类型的 provider 包装器：可指定任务持续失败（包括连续出价失败）、首轮前 N 次出价返回不想发言、仅首次洞察触发失败、总结输出非法 JSON，或总结连续失败；首轮无出价场景通过测试内包装 provider 构造，不修改 mock 的公开签名。
- OpenAI 兼容提供商只接受 fake `fetch`：构造成功 JSON、含 `reasoning_content` 的消息、跨 chunk SSE、429 后恢复、连续 5xx 与 abort 超时。测试断言只检验错误行为和密钥不泄漏，不发出真实网络请求。
- REST/SSE 集成测试使用内存 SQLite 与随机本地 HTTP 端口；事件补发数据优先使用种子记录的结构性性质，不依赖具体种子发言文本或发言条数。

## 5. E2E 场景清单（后续 E2E 阶段实现）

- [ ] 大厅显示种子讨论列表，并按状态分组、显示暂停状态。
- [ ] 新建话题 → 生成阵容 → 用户确认 → 进入直播。
- [ ] 专家小窗能反映待机、准备发言、发言中及公开关注点变化。
- [ ] Transcript 只包含完成发言，不包含举手等内部事件。
- [ ] 讨论结束前出现共识与分歧更新。
- [ ] 结束后出现自然语言主持人总结；页面不展示 JSON。
- [ ] 同时运行的两场讨论相互隔离。
- [ ] 超宽、桌面、窄屏三档视口下页面整体不滚动，各内容区域可独立滚动。
- [ ] 前端资源和 API 响应均不包含配置的 API Key。
- [ ] 暂停当前发言后停止推进，继续后恢复讨论。

## 6. 已确认

- `SchedulerInput.seatByParticipantId` 是座位信息映射；用于在出价分数、紧急度及随机扰动仍并列时按较小 seat 裁决。
- `NormalizedBid.participantId` 保持可选，因为无效输入的精确默认对象不包含该字段；Runner 负责将专家身份与出价配对。
- `TASK_ROUTING` 的 `thinking`、`temperature` 与 `maxTokens` 按 ARCHITECTURE §6.2 固定表取值；所有任务的思考模式均为 `disabled`。
- 主持人策略先判断 `noBidders`，再判断上一条发言是否来自主持人；全部出价请求失败计为一次连续失败轮次，但不设置 `noBidders`。出价失败轮次与发言失败轮次共用计数，任一条发言成功即清零；连续三轮失败后暂停、推送 `error`，且 Runner 的 `done` 正常完成。
