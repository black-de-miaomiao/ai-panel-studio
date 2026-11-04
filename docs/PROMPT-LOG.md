# 核心 Prompt 记录

用户提出需求并做关键决定；Factory Droid 主代理作为编排者拆分阶段、撰写 Prompt、审查产出并分层提交；luna-worker 子代理按各阶段范围执行。各阶段完整 Prompt 原文保存在 [`docs/prompts/`](prompts/)；本文摘录核心目标与约束，并记录日志中真实发生的修正。

| 序号 | 范式标签 | Prompt 文件 | 执行者 | 对应提交 |
|---:|---|---|---|---|
| 01 | 【SDD 阶段】 | [01-sdd-docs.md](prompts/01-sdd-docs.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `512e60e` docs(sdd): 产品需求、数据模型、API/SSE 契约与架构规格 |
| 01b | 【SDD 阶段】 | [01b-sdd-review-fixes.md](prompts/01b-sdd-review-fixes.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `512e60e` docs(sdd): 产品需求、数据模型、API/SSE 契约与架构规格 |
| 02 | 【SDD 阶段】 | [02-scaffold.md](prompts/02-scaffold.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `027a769` chore(scaffold): npm workspaces 单仓（shared / server / web）与工具链 |
| 03 | 【SDD 阶段】 | [03-sdd-schema-contracts.md](prompts/03-sdd-schema-contracts.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `d187674` feat(db,shared): SQLite 建表脚本、种子数据、数据访问层与共享 zod 契约 |
| 03b | 【SDD 阶段】 | [03b-seed-review-fixes.md](prompts/03b-seed-review-fixes.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `ef7421e` fix(seed): 往期回放样例改为由出价驱动的非机械发言，洞察立场与原话对齐 |
| 04 | 【DDD 阶段】 | [04-ddd-ui.md](prompts/04-ddd-ui.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `a87885c` feat(ui): 深夜演播厅设计规范与组件、页面（mock 事件剧本驱动） |
| 05 | 【TDD 阶段】 | [05-tdd-red.md](prompts/05-tdd-red.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `a1860b0` test(server): TDD Red——核心规则、LLM 网关、讨论引擎与 REST/SSE 的失败用例与桩 |
| 05b | 【TDD 阶段】 | [05b-tdd-red-sync.md](prompts/05b-tdd-red-sync.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `1f0e66f` docs(spec): 主持人策略保证推进、DeepSeek 关闭思考模式、出价全失败计入失败轮次；`a1860b0` test(server): TDD Red |
| 06 | 【TDD 阶段】 | [06-tdd-green-core.md](prompts/06-tdd-green-core.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `3b403af` feat(server): TDD Green（一）——核心规则、LLM 网关与运行时 Prompt |
| 06b | 【TDD 阶段】 | [06b-runtime-prompt-review.md](prompts/06b-runtime-prompt-review.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `3b403af` feat(server): TDD Green（一） |
| 08a | 【DDD 阶段】 | [08a-ddd-visual-fixes.md](prompts/08a-ddd-visual-fixes.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `2c672f3` fix(ui): DDD 视觉评审修订——超宽屏舞台、专家小窗、对比度、状态字幕、结束态洞察与样式拆分 |
| 08a 续派 1 | 【DDD 阶段】 | [08a-ddd-visual-fixes.md](prompts/08a-ddd-visual-fixes.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `2c672f3` fix(ui): DDD 视觉评审修订 |
| 08a 续派 2 | 【DDD 阶段】 | [08a-ddd-visual-fixes.md](prompts/08a-ddd-visual-fixes.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `2c672f3` fix(ui): DDD 视觉评审修订 |
| 06c | 【TDD 阶段】 | [06c-mock-quality.md](prompts/06c-mock-quality.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `90d8cb1` feat(prompts): 运行时 Prompt 收尾；`64af7ae` feat(llm): mock 提供商话题无关化与文本自然度 |
| 06d | 【TDD 阶段】 | [06d-mock-text.md](prompts/06d-mock-text.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `64af7ae` feat(llm): mock 提供商话题无关化与文本自然度 |
| 06d 补充更正 | 【TDD 阶段】 | [06d-mock-text.md](prompts/06d-mock-text.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `64af7ae` feat(llm): mock 提供商话题无关化与文本自然度 |
| 08 | 【DDD 阶段】 | [08-web-integration.md](prompts/08-web-integration.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `634d125` feat(web): 前端接入真实 REST 与 SSE——HTTP 客户端、事件流重连与页面接线 |
| 08 续派 1 | 【DDD 阶段】 | [08-web-integration.md](prompts/08-web-integration.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `634d125` feat(web): 前端接入真实 REST 与 SSE |
| 08 续派 2 | 【DDD 阶段】 | [08-web-integration.md](prompts/08-web-integration.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `b202f06` fix(web): 结束讨论时 REST 响应不再清空已收到的总结；修复 SSE 测试偶发失败 |
| 07 | 【TDD 阶段】 | [07-tdd-green-engine.md](prompts/07-tdd-green-engine.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `d6aabc4` feat(server): 讨论引擎、事件总线、REST 与 SSE 落地，mock 与 DeepSeek 整场联调通过 |
| 07 续派 1 | 【TDD 阶段】 | [07-tdd-green-engine.md](prompts/07-tdd-green-engine.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `d6aabc4` feat(server): 讨论引擎、事件总线、REST 与 SSE 落地 |
| 07 续派 2 | 【TDD 阶段】 | [07-tdd-green-engine.md](prompts/07-tdd-green-engine.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `4f40e75` feat(server): 抢答额度改由 Runner 控制；换一批失败时保留原阵容 |
| 07 续派 3 | 【TDD 阶段】 | [07-tdd-green-engine.md](prompts/07-tdd-green-engine.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `f5ee7fa` feat(server): 出价格式失败重试一次；调度增加发言行为多样性加成 |
| 07b | 【TDD 阶段】 | [07b-error-body-contract.md](prompts/07b-error-body-contract.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `7fb13e7` fix(server): 所有错误响应统一带 details，前端不再丢失服务端中文提示 |
| 06e | 【TDD 阶段】 | [06e-mock-discussion-flow.md](prompts/06e-mock-discussion-flow.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `16d238f` chore: 接手快照（首轮与续派 1）；`ee3f5b0` fix(server): llm-smoke 脚本补传 lastInterventionAct；`80f52f0` feat(llm): mock 讨论质量收口（续派 2） |
| 09 | 【E2E 阶段】 | [09-e2e.md](prompts/09-e2e.md) | luna-worker 子代理（配置为 GPT-6 Luna） | `5421a22` fix(server): 洞察立场按座位排序、同毫秒洞察按写入顺序，E2E 增加可复现讨论 ID；`179aca1` test(e2e): Playwright 端到端九个场景与质量闭环 |
| 10 | 【交付】 | [10-docs-delivery.md](prompts/10-docs-delivery.md) | luna-worker 子代理（配置为 GPT-6 Luna） | 文档与交付（本文所在提交） |

## 按时间顺序的核心 Prompt

## 【SDD 阶段】Prompt 01 · 需求规格化：PRD、ER、API 与架构

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`512e60e` docs(sdd): 产品需求、数据模型、API/SSE 契约与架构规格。

Prompt 原文摘录：

```text
> 为什么先写规格：后续每个编码阶段都由新的子代理执行，它们没有本次对话的记忆，只能读仓库里的文档。把需求理解和设计决策固化成精确的文档，可以避免上下文漂移和模型“自由发挥”（幻觉）。

## 0. 开始前

1. 仓库根目录：`C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先完整阅读根目录的 `AGENTS.md`。
2. 另一个子代理正在并行搭建脚手架（根 package.json、shared/、server/、web/）。**你只能创建第 3 节列出的 4 个文件**，不要创建或修改其他任何文件，不要运行 npm。
3. 不要读取 `server/.env`。

## 1. 业务需求（作业原文要点，PRD 必须完整覆盖）

### 1.1 产品定位

「AI Panel Studio」是一款“AI 圆桌讨论”本地 Web 应用：用户输入任意讨论话题并指定参会专家人数（默认 4 人），系统调用大模型动态生成一组主持人与专家嘉宾，展示每位嘉宾的姓名、职业、Title、立场与专属颜色标识；用户确认阵容后进入演播厅讨论模式，观看一场由 AI 驱动、实时推进的圆桌讨论。

核心价值主张：让任何人都能瞬间召集一支“虚拟智库”，围绕任意议题展开深度碰撞——主持人负责开场、追问、串联与收尾，专家之间自主“举手/抢答/补充/反驳”，讨论过程中持续生成共识与分歧，最终呈现一场沉浸式的 AI 圆桌实况。

（中略）

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
```

完整原文：[docs/prompts/01-sdd-docs.md](prompts/01-sdd-docs.md)。

说明：这一阶段先把产品需求、数据模型、API、状态机和算法写成后续可执行的规格。Prompt 明确要求子代理只创建四份文档，避免与并行脚手架工作互相覆盖。

## 【SDD 阶段】Prompt 01b · 评审回路：补齐规格中的未定义行为

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`512e60e` docs(sdd): 产品需求、数据模型、API/SSE 契约与架构规格。

Prompt 原文摘录：

```text
# 【SDD 阶段 · Prompt 01b】编排者评审意见：补齐规格中的未定义行为

| 项 | 内容 |
|---|---|
| 范式 | SDD 评审回路（Review → Fix）：编排者审阅 01 阶段产出后，对子代理自己报告的风险点做出决定，要求在原文档中精确补齐 |
| 执行者 | 01 阶段的同一个 luna-worker 子代理（续用上下文） |
| 编排者 | Factory Droid 主代理 |

> 为什么要这一步：规格里任何“未定义”的地方，到了 TDD 阶段都会被不同子代理各自解释，测试和实现就会对不上。所以在进入编码前，把子代理报告的风险逐条拍板并写回文档。

只修改下面列出的位置，其他内容保持不变：

1. **洞察合并返回值**（`docs/ARCHITECTURE.md` 5.E ⑧）：`changed: boolean`。当且仅当本次合并新增、修改或淘汰了任意条目时为 true；补丁为空、或所有条目都被丢弃时为 false。删除“具体类型尚未定义”的表述。
2. **调度同分决胜**（`docs/ARCHITECTURE.md` 5.C）：总分相同（含 rng 扰动后仍相同）时，依次比较：urgency 高者优先，再 seat 小者优先。
3. **SSE 补发与实时订阅的竞态**（`docs/API.md` 的 SSE 小节与客户端接入时序；`docs/ARCHITECTURE.md` 第 8 章补一段）：服务端处理新连接时，**先订阅** EventBus 并把实时事件放进缓冲区，**再**从 events 表查询 seq 大于游标的持久事件依次发送，然后冲刷缓冲区——缓冲中的持久事件若 seq ≤ 已发送的最大 seq 则跳过，其余事件（含瞬时事件）按到达顺序发送，之后切换为直接推送。客户端 reducer 对持久事件按 seq 去重。这样既不漏发也不重发。
4. **主持人策略上下文**（`docs/ARCHITECTURE.md` 5.D）：`expertTurnsSinceHost` = 最近一次主持人发言（含 opening）之后的专家发言条数；主持人发言后 `noBidders` 复位为 false；被点名专家发言后 `addressed` 清空（主循环里已有，此处在规则说明中写明）。
5. **F8 导出 Markdown 纳入首个交付**（`docs/PRD.md` F8 与第 7 节）：去掉“若纳入迭代”“仅在该 P1 功能被排期时提供”“是否纳入由编排者决定”等措辞，优先级仍标 P1。

完成后报告每处改动所在的文件与章节。
```

完整原文：[docs/prompts/01b-sdd-review-fixes.md](prompts/01b-sdd-review-fixes.md)。

说明：01b 将评审阶段发现的歧义逐条变为明确规则，尤其锁定 SSE 的订阅、补发和去重顺序。编排日志确认这些决定写回规格后再进入编码。

## 【SDD 阶段】Prompt 02 · monorepo 脚手架与工具链基线

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`027a769` chore(scaffold): npm workspaces 单仓（shared / server / web）与工具链。

Prompt 原文摘录：

````text
# 【工程准备 · Prompt 02】monorepo 脚手架与工具链基线

| 项 | 内容 |
|---|---|
| 范式 | 工程准备：为 SDD / DDD / TDD / E2E 各阶段提供可运行、可测试的骨架 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 产出 | 根配置、shared / server / web 三个工作区骨架、依赖一次装齐、git 初始化 |
| 约束 | 不写业务逻辑；不创建 `docs/` 下任何文件和 `README.md`；不改 `AGENTS.md`；不碰 `server/.env` |

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`，已存在 `AGENTS.md`、`docs/prompts/`、`server/.env`。先完整阅读 `AGENTS.md`。
- `server/.env` 含真实密钥：不要读取、打印、修改或删除。
- 另一个子代理正在并行写 `docs/PRD.md` 等规格文档：不要创建或修改 `docs/` 下任何文件。

## 1. 目标结构

```text
ai-panel-studio/
├─ package.json              # workspaces + 根脚本
├─ tsconfig.base.json
├─ .gitignore  .gitattributes  .editorconfig  .nvmrc
├─ shared/                   # @aps/shared
│  ├─ package.json  tsconfig.json
│  └─ src/index.ts  src/index.test.ts
├─ server/                   # @aps/server
│  ├─ package.json  tsconfig.json  vitest.config.ts  .env.example
│  ├─ db/.gitkeep
│  ├─ scripts/db-init.ts
│  └─ src/index.ts  app.ts  config.ts  db/connection.ts  （及对应 *.test.ts）
└─ web/                      # @aps/web
   ├─ package.json  tsconfig.json  vite.config.ts  index.html
   └─ src/main.tsx  App.tsx  App.test.tsx  styles/index.css  test/setup.ts
```
````

完整原文：[docs/prompts/02-scaffold.md](prompts/02-scaffold.md)。

说明：该 Prompt 按规格预定了目录边界、npm workspaces 和一次性依赖安装，并把脚手架与正在编写的文档隔离。编排日志没有记录该阶段的额外返工问题，因此这里不补写未发生的挑战。

## 【SDD 阶段】Prompt 03 · 契约代码化：SQLite、样例数据与共享类型

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`d187674` feat(db,shared): SQLite 建表脚本、种子数据、数据访问层与共享 zod 契约。

Prompt 原文摘录：

```text
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
```

完整原文：[docs/prompts/03-sdd-schema-contracts.md](prompts/03-sdd-schema-contracts.md)。

说明：先把 ER/API 规格固化为 SQL、repository 和 shared 的 zod 契约，后续前后端可以共享类型而并行开发。Prompt 指定数据库、接口和事件出现冲突时分别以 ER 与 API 为准。

## 【SDD 阶段】Prompt 03b · 种子回放评审修订

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`ef7421e` fix(seed): 往期回放样例改为由出价驱动的非机械发言，洞察立场与原话对齐。

Prompt 原文摘录：

```text
> 为什么要改：往期回放是评审者打开应用后最先看到的完整讨论，它本身就是“非机械轮流、真实交锋、有据可查的共识与分歧”的产品示范。样例若按座位轮流发言、洞察立场与原话对不上，会直接削弱产品可信度。

## 问题与修订要求

### 1. 回放发言顺序是机械轮流（必须修）

现状：专家发言顺序为 程砚秋 → 梁映南 → 顾行简 → 叶轻舟 → 程砚秋 → …，严格按 seat 轮转，4 人发言次数完全相同。

要求：重写「远程办公会全面取代坐班吗？」的 Transcript：

- 共 16–18 条：1 条 opening、14–16 条正文、1 条 closing；`turn_count` = 正文条数，`max_turns` 保持 16。
- 专家顺序由“谁更想说”驱动：发言次数不均衡（最多与最少相差 ≥ 2），至少 2 组直接来回交锋（A 反驳 B 后，B 在随后 2 条之内回应 A），至少 1 次抢答紧跟在被抢答者之后。
- 同一专家不能连续两条发言。
- 主持人插话 3–4 次，follow_up、bridge、invite 各至少 1 次，语义与 ARCHITECTURE §5.D 一致：
  - 三种插话都设置 `reply_to_participant_id` 为目标专家，且下一条发言就是该目标专家。
  - follow_up 追问上一位专家发言人。
  - bridge 点名一个真实存在的分歧及其双方，请目标专家（分歧一方，且不是上一位发言人）回应。
  - invite 点名当时发言次数最少的专家，被点名者的下一条发言 act 为 `statement`。
- 发言 act 与内容一致：
  - rebut 明确反驳 reply_to 专家的某个具体观点（点名或复述对方观点）。
  - supplement 在 reply_to 的观点上补充新的条件或例子。
  - interrupt 短促有力（可用“等一下”“我得插一句”开头），reply_to 为紧邻的上一位发言人。
  - statement 提出新角度。
  - rebut、supplement、interrupt 都必须有 reply_to。
- 语言为电视圆桌的口语表达；每条 1–2 句（opening ≤ 3 句）；有具体机制或例子；不编造机构名称或精确统计数字。
```

完整原文：[docs/prompts/03b-seed-review-fixes.md](prompts/03b-seed-review-fixes.md)。

说明：编排日志记录首版回放严格按座位轮转、洞察立场与原话错位、stanceTag 使用领域名词。03b 用可量化的交锋、次数差、seq 证据和立场标签验收标准修订种子，并单独提交。

## 【DDD 阶段】Prompt 04 · 深夜演播厅 UI 规范、组件与页面

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`a87885c` feat(ui): 深夜演播厅设计规范与组件、页面（mock 事件剧本驱动）。

Prompt 原文摘录：

```text
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
```

完整原文：[docs/prompts/04-ddd-ui.md](prompts/04-ddd-ui.md)。

说明：DDD 先定义视觉和交互，再用与真实 SSE 同构的 mock 事件剧本驱动 reducer 与页面。编排日志记录这套设计后来通过截图审查和多轮精确续派收口。

## 【TDD 阶段】Prompt 05 · Red：测试先行与完整签名桩

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`a1860b0` test(server): TDD Red——核心规则、LLM 网关、讨论引擎与 REST/SSE 的失败用例与桩。

Prompt 原文摘录：

```text
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
```

完整原文：[docs/prompts/05-tdd-red.md](prompts/05-tdd-red.md)。

说明：Red 阶段先把 core、LLM、引擎和 REST/SSE 规则变为测试，再留实现桩。编排日志记录该轮最终有预期的 NOT_IMPLEMENTED 失败，也有一个因未实现导致的错误类型不符，未将它伪装成通过。

## 【TDD 阶段】Prompt 05b · Red 评审回路：规格变更后同步测试

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`1f0e66f` docs(spec): 主持人策略保证推进、DeepSeek 关闭思考模式、出价全失败计入失败轮次；`a1860b0` test(server): TDD Red。

Prompt 原文摘录：

```text
> 为什么要这一步：测试是规格的可执行版本。规格改了，测试必须先跟上，Green 阶段的实现才有唯一的判断标准。

---

编排者已审查你的 Red 产出，整体质量合格。根据你的提问与评审结论，规格已更新并提交（commit 1f0e66f，docs/ARCHITECTURE.md）。请阅读 `git show 1f0e66f` 的差异，然后让桩与测试和新规格同步。仍然只写测试与桩签名，不写实现。

## 规格变更与需要的改动

1. §5.D 主持人策略：`noBidders` 规则提到首位（规则 0），即使上一条发言来自主持人也适用；原规则 0（上一条来自主持人 → experts）变为规则 1。
   - hostPolicy.test.ts 新增用例：上一条来自主持人且上一轮无人出价时，仍邀请 speakCount 最少、seat 最小的专家。
   - 现有用例与新顺序不冲突的保持不变。

2. §6.2 思考模式与 maxTokens：
   - llm/types.ts：新增 `export type LLMThinking = 'disabled' | 'low' | 'high'`；`LLMRequest` 增加 `thinking?: LLMThinking`；`TaskRouting` 增加 `thinking: LLMThinking`。
   - `TASK_ROUTING` 按规格表取值，全部 `thinking: 'disabled'`：lineup 0.9 / 3000，summary 0.5 / 1500，bid 0.7 / 300，utterance 0.8 / 300，host 0.7 / 300，insights 0.2 / 1500（temperature / maxTokens）。
   - openaiCompatible.test.ts 新增：
     - thinking = 'disabled' 时，请求体含 `thinking: { type: 'disabled' }`，并带 temperature 与 max_tokens。
     - thinking = 'low' 时，请求体含 `thinking: { type: 'enabled' }` 与 `reasoning_effort: 'low'`，且不含 temperature 键。
     - 未提供 thinking 时，请求体不含 thinking 与 reasoning_effort。
   - gateway.test.ts：断言网关把 TASK_ROUTING 中的 thinking、temperature、maxTokens 透传给提供商（可以合并进现有的路由用例，或新增一条）。

3. §3.1 与 §8.2 失败轮次：
   - runner.test.ts 新增：
     - 出价任务持续失败（mock failOn 命中 bid）时，连续 3 轮后状态变为 paused，推送 error 事件，且没有新增正文发言；进程不崩溃，done 不 reject。
     - 开场后若首轮无人出价，主持人点名（act = invite）并继续推进，最终讨论正常结束。构造方式：在测试里用一个包装的 LLMProvider，前 N 次 bid 调用返回 `{"wantToSpeak": false}`，其余调用委托给 mock 提供商；不要为此修改 mock 的公开签名。
   - 如果现有的“发言连续失败三轮”用例需要按“共用计数，发言成功即清零”的语义调整，同步修改。

4. 你提出的两点，编排者确认采纳：`SchedulerInput.seatByParticipantId`；`NormalizedBid.participantId` 可选（Runner 负责把出价和专家配对）。

5. docs/TEST-PLAN.md：映射表补上新增用例；“待确认事项”一节改为“已确认”，写明上述决定。

## 约束不变
只改 server/（不含 server/db 与 server/src/db）和 docs/TEST-PLAN.md；验证只用 `-w @aps/server` 的命令；不安装依赖、不执行 git 写操作（`git show` / `git diff` 这类只读命令可以用）、不读取 server/.env。
```

完整原文：[docs/prompts/05b-tdd-red-sync.md](prompts/05b-tdd-red-sync.md)。

说明：编排日志记载评审发现“开场后无人出价”可能让循环空转，以及全部出价失败没有计入失败轮次；编排者先改规格，05b 再同步测试。该日志还记录 Prompt 基线把 28 个既有用例误算为 31 个，子代理如实指出差异，没有为凑数修改测试。

## 【TDD 阶段】Prompt 06 · Green（一）：核心规则、网关与运行时 Prompt

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`3b403af` feat(server): TDD Green（一）——核心规则、LLM 网关与运行时 Prompt。

Prompt 原文摘录：

```text
> 为什么分两步做 Green：纯函数和 LLM 网关是引擎的地基。先让地基的测试全部变绿，并用真实 DeepSeek 把运行时 Prompt 调到“像真人圆桌”，下一步写引擎时就只需关心编排与并发。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md`；完整读 `docs/ARCHITECTURE.md` 的 §3.3、§5、§6、§7 和 `docs/TEST-PLAN.md`；再读 `server/src/core`、`server/src/llm`、`server/src/prompts` 下的全部桩与测试。
- 并行：另一个子代理可能正在 `web/` 下工作。验证只运行 `-w @aps/server` 的命令。

## 1. 规则

- 测试是规格的可执行版本。不允许为了变绿而修改断言、跳过或删除测试、放宽容差。若确认某个测试与 `docs/ARCHITECTURE.md` 冲突，以文档为准修正测试，并在报告里逐条列出：原断言、文档依据、新断言。
- `engine/**`、`routes/**` 的测试属于下一阶段，本阶段允许继续以 NOT_IMPLEMENTED 失败；但你的改动不能给它们带来新的类型错误。
- 纯函数不读时钟、不调用 `Math.random`；随机性一律通过 `rng` 参数注入。
- 不改桩的导出名。若必须调整签名，同步修改所有引用和测试，并在报告中说明理由。

## 2. core（规则以 ARCHITECTURE §5 A–H 与 §5.1 权重表为准）

逐个实现 lineup、bid、scheduler、hostPolicy、insights、sentences、json、context、rng。注意：
```

完整原文：[docs/prompts/06-tdd-green-core.md](prompts/06-tdd-green-core.md)。

说明：编排日志记录 core、llm、prompts 的 83 个用例通过，前两次真实 DeepSeek 冒烟通过格式检查，但输出还没有达到“像真人圆桌”。随后 06b 从输入结构和真实文本中找根因，而不是为了测试变绿改断言。

## 【TDD 阶段】Prompt 06b · 运行时 Prompt 评审：格式对但不像圆桌

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`3b403af` feat(server): TDD Green（一）。

Prompt 原文摘录：

```text
编排者审查了你的产出。网关、OpenAI 兼容提供商、core 实现与测试质量合格，冒烟也证明格式规则都生效了。但两次冒烟暴露出运行时 Prompt 的结构性问题，直接影响“像真人圆桌”这一核心体验。请修复后再跑 1 次冒烟（这是第 3 次，也是最后一次整场冒烟）。

## 观察到的问题（run-1 / run-2）
1. 两次共 24 次出价没有一次 rebut 或 interrupt；几乎所有专家每轮都 wantToSpeak=true，urgency 集中在 0.55–0.7。立场为“反对”的专家（run-2 的 E4）听到对立观点，也只选 supplement。
2. 主持人开场两次都把 4 位嘉宾说成“三个领域”。
3. 4 条正文后洞察两次都为空。但 run-1 里 E4 明确接着 E1 的“反馈断层”往下说，总结也把它称为共识。洞察面板与总结不一致，而“实时共识与分歧”是作业的硬性要求。
4. run-2 的总结出现“目前尚无已确认的共识或分歧”“这些观点都还停留在各自的分析层面”这类说明性语句，不像主持人收尾。

## 根因（编排者读 prompts/index.ts 后的判断）
- 别名表只有“E1（专家）”，没有姓名、身份和立场；而 ARCHITECTURE §7.1 / §7.2 的 aliasMap 是“别名 → 姓名”。出价者看不到别人的立场，无法判断该不该反驳；主持人开场看不到嘉宾名单，只能猜。
- 出价 Prompt 没有 urgency 刻度，也没有点明“上一位发言人是谁、立场是否与你相反”。
- 洞察 Prompt 只给本次新增发言，没给最近发言窗口；还要求 evidence 只能来自本次新增发言，而 §5.E ③ 的规则是 evidence 属于 validSeqs 即可。
- 总结 Prompt 要求“没有条目时明确说明目前尚无已确认的共识或分歧”。

编排者已同步规格：`git diff -- docs/ARCHITECTURE.md` 可看到 §5.A、§5.E 的截断规则（超长时以“…”结尾，你对 lineup.test.ts 的修改因此被确认，不需要改回），以及 §7.1 新增的“阵容名册、出价的上一条发言与立场关系、洞察的发言窗口”。

## 修改要求
1. 阵容名册（roster）：每位参与者的别名、姓名、职业 · Title、立场标签，以及专家的一句立场（stance）。传给 bid、utterance、host、insights、summary 五个 builder，在 user 文本中渲染为例如 `E2 陈澄｜用户研究负责人｜立场：审慎｜担心复杂问题中的信任下降`。不得出现 UUID。别名表也改为包含姓名。
2. 出价：user 文本写明“上一条发言：#seq 别名 姓名（立场标签）”和“与你的立场：相同 / 不同 / 主持人发言”，由代码计算；给出 urgency 刻度（0.85–1 被点名或直接冲突且有具体反驳；0.6–0.8 明确反驳点或关键补充；0.3–0.55 一般补充；没有新内容就不发言）；立场不同且能指出具体漏洞时优先 rebut；同一轮通常只有一两位专家有强烈的发言欲望。
3. 主持人：opening 用一句话依次点到全部嘉宾（姓名 + 身份）；bridge 写出分歧两方的姓名与立场；invite 写出目标的职业 · Title。
4. 洞察：同时给出最近 10 条发言窗口与本次新增发言，evidence 可引用窗口中任意真实 seq；supplement 通常构成共识，rebut 或明确的“不同意”构成分歧；同一对专家反复交锋用 ref 更新同一条分歧；宁缺毋滥，但遇到明确的认同或对立必须记录。
5. 总结：删除“明确说明目前尚无已确认的共识或分歧”；共识与分歧以洞察区为准，没有的不要说成已形成共识；不写说明性语句，像主持人收尾。
```

完整原文：[docs/prompts/06b-runtime-prompt-review.md](prompts/06b-runtime-prompt-review.md)。

说明：编排日志将“24 次出价无 rebut/interrupt、主持人无法准确点名、洞察为空、总结说明性语句”追到 roster、出价关系和洞察窗口输入。Prompt 06b要求补结构化上下文、测试并再跑最后一次整场冒烟。

## 【DDD 阶段】Prompt 08a · 首轮视觉修订与样式拆分

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`2c672f3` fix(ui): DDD 视觉评审修订——超宽屏舞台、专家小窗、对比度、状态字幕、结束态洞察与样式拆分。

Prompt 原文摘录：

```text
> 为什么要这一步：作业的核心考察点之一是“UI 是否真的像在观看一场演播厅讨论”，超宽屏也是作业点名要支持的布局。DDD 首版在 1440 下观感合格，但 2560 下舞台大面积留空、专家小窗信息稀疏，次要文字的对比度也偏低。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md`、`docs/UI-DESIGN.md`，再读 `web/src/styles/index.css` 和 `web/src/components/studio/` 下的组件，看 `_review\ddd\` 的旧截图。
- 并行：另一个子代理正在 `server/` 下工作。验证只运行 `-w @aps/web` 的命令，不要运行根目录的 `npm run typecheck` 或 `npm test`。

## 1. 先拆分样式（纯重构，视觉零变化）

- 把 `web/src/styles/index.css`（约 4000 行）按区域拆成 `tokens.css`（设计令牌与 `@theme`）、`base.css`（重置、排版、滚动条、动效关键帧）、`ui.css`（通用组件）、`lobby.css`、`lineup.css`、`studio.css`。`index.css` 只保留 `@import "tailwindcss"` 和对这些文件的导入，注意 Tailwind v4 对 `@import` 顺序与 `@theme` 位置的要求。
- 合并重复的选择器；删除没有任何组件引用的样式（用 `rg` 检查类名是否被引用）。
- 验证视觉零变化：拆分前先拍基准截图（大厅、新建页、阵容确认、演播厅，视口 1440 / 2560 / 390），拆分后重拍并逐像素比较（可以用 Python 加 PyMuPDF 的 `fitz.Pixmap` 读取 PNG 后比较）。演播厅画面随剧本变化，要等到确定的状态（例如结束态）再拍，或者改为比较关键元素的位置与尺寸。差异必须为 0，或者能解释（例如流式光标闪烁）。

## 2. 视觉修订

1. **超宽屏舞台（≥ 1600px）**：2560×1080 下舞台列大面积留空，主持人席位和专家小窗显得过小。用容器查询（`@container`，`cqw` / `cqh`）按舞台尺寸放大席位、头像、字号与小窗高度，让专家小窗明显变大并展示更多信息（立场陈述、关注点）。可以把字幕条移进舞台中下部，形成电视“下三分之一”字幕的效果。1440 与 390 的布局保持现状。
2. **专家小窗的信息密度**：每个小窗始终有“关注点”一行。有 focus 时显示 focus（准备发言时同时显示意图徽标）；还没有 focus 时显示弱化的“正在聆听”占位，不要留空白。发言中保留声波动效。小窗只展示公开的 focus，不出现任何推理过程。
3. **对比度**：职业 · Title、关注点、Transcript 次要信息、总结正文在深色背景上偏暗。正文类文字对比度至少 4.5:1；`#5C6575` 只用于装饰性标签。总结段落使用主文字色，并适当增大行高。
4. **结束 / 暂停态字幕条**：ended 时显示“讨论已结束”，paused 时显示“讨论已暂停”，不要显示“等待下一位发言…”。
5. **窄屏顶栏**：390 宽度下补上状态徽标（LIVE / 已暂停 / 已结束等）。
6. **窄屏字幕条**：390 下发言人姓名挤在字幕图标下方，排版错位。改为“发言人（头像 + 姓名 + 职业）”一行、字幕文本一行。

每项修订都同步写进 `docs/UI-DESIGN.md` 的对应章节（对比度规则、超宽屏规则、专家小窗内容、字幕条状态文案、窄屏顶栏）。
```

完整原文：[docs/prompts/08a-ddd-visual-fixes.md](prompts/08a-ddd-visual-fixes.md)。

说明：编排日志记载该阶段把约四千行样式拆成六个文件，静态页面拆分前后像素差异为零；编排者之后按截图而非仅看测试继续追查布局和状态语义问题。

## 【DDD 阶段】Prompt 08a · 续派 1：小窗语义与常见视口

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`2c672f3` fix(ui): DDD 视觉评审修订。

Prompt 原文摘录：

```text
---

## 续派 1（07:25，编排者审阅 `_review\ddd2\` 截图后，resume 同一子代理）

编排者已审阅 _review\ddd2\ 的截图：超宽屏小窗、对比度、暂停/结束字幕、窄屏顶栏与字幕都达标。还有两处需要补：

1. “正在聆听”占位的语义：现在发言中的专家（例如 studio-demo-1440 与 studio-paused-1440 里的沈禾，状态为“发言中”）也显示“关注点：正在聆听”，讨论结束后的小窗也是“正在聆听”。改为：
   - 只有讨论为 live、该专家为 idle 且没有 focus 时，才显示“正在聆听”。
   - 发言中且没有 focus 时，这一行显示“正在发言”；有 focus 时照常显示 focus。
   - 讨论为 paused / ended / summarizing 等非 live 状态时：有 focus 显示最后一次的公开 focus，没有则隐藏这一行，不显示占位。
   - 小窗组件需要知道讨论状态的话，从父组件以 props 传入，不要改 state 与 mocks 的接口。
   - 补组件测试覆盖上面三种情况。

2. 1920×1080 是评审者最常见的屏幕，而 ≥1600 会进入超宽屏布局，但还没有截图验证过。请补拍 1920×1080 与 1680×1050 两档：studio-demo（有人发言中）、studio-ended、lobby。检查页面不整体滚动、三栏比例协调、专家小窗与 Transcript 文字不挤压不截断、没有元素重叠。发现问题就修，并说明改动。截图命名 `studio-demo-1920.png`、`studio-ended-1920.png`、`lobby-1920.png`、`studio-demo-1680.png` 等，放在 _review\ddd2\。

完成后重新运行 `npm run typecheck -w @aps/web`、`npm test -w @aps/web`、`npm run build -w @aps/web`，并重拍受影响的截图（1440、2560、390 的 studio-demo 与 studio-ended）。约束与之前相同；另一个子代理仍在 server/ 下工作。最后一条消息是完整报告（改动文件、测试数量、截图路径、发现与修复的问题），报告后不要再发其他消息。
```

完整原文：[docs/prompts/08a-ddd-visual-fixes.md](prompts/08a-ddd-visual-fixes.md)。

说明：编排日志记载编排者发现“正在聆听”占位也出现在发言态和结束态，并指出 1920×1080 尚未覆盖。续派把视觉反馈变成状态 × 视口的明确验收，而不是笼统要求“再美化”。

## 【DDD 阶段】Prompt 08a · 续派 2：结束态洞察切换与超宽屏堆叠

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`2c672f3` fix(ui): DDD 视觉评审修订。

Prompt 原文摘录：

```text
# 【DDD 阶段 · Prompt 08a】视觉评审修订：超宽屏舞台、专家小窗、对比度、状态文案与样式拆分

| 项 | 内容 |
|---|---|
| 范式 | DDD 评审回路（Review → Fix）：编排者审阅 DDD 截图（1440 / 2560 / 390）后提出修订。只改表现层，不改数据流 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`、`docs/UI-DESIGN.md`、`web/src`（DDD 产出）、旧截图与截图脚本 `C:\Users\123\Desktop\mianshiti\_review\ddd\`（`shot.mjs`） |
| 产出 | `web/src/styles/*.css`、相关组件的表现层修改与组件测试、`docs/UI-DESIGN.md` 同步；新截图放在 `C:\Users\123\Desktop\mianshiti\_review\ddd2\` |
| 约束 | 只改 `web/` 与 `docs/UI-DESIGN.md`；不改 `shared/`、`server/`；不改 `web/src/state`、`web/src/api`、`web/src/mocks` 的数据流与接口（下一阶段接入真实 API 依赖它们）；不安装依赖；不读取 `server/.env`；不执行 git 写操作 |

（中略）

## 续派 2（07:42，编排者审阅 1920 截图后，resume 同一子代理）

编排者已审阅 1920 截图：关注点语义、1680 换行修复都正确。还有两处布局问题需要修：

1. 结束后桌面端看不到共识与分歧的内容：1440 与 ≥1600 布局在 summarizing / ended 时，用 SummaryPanel 替换了 InsightsPanel，只剩“共识 3 条 · 分歧 1 条”的计数。打开一场“往期回放”时，桌面端无法查看具体的共识与分歧条目（窄屏有 Tab，没有这个问题）。PRD 要求回放完整展示 Transcript、共识与分歧与总结，E2E 也会检查这一点。
   - 修改：在这个面板位置提供两个切换项“主持人总结 / 共识与分歧”（复用现有 Tabs 组件，带计数，键盘可操作，并有正确的 aria 属性）。summarizing 与 ended 时默认显示“主持人总结”；live 与 paused 时保持现状，只显示洞察。底部的“共识 N 条 / 分歧 N 条”计数可以点击，切换到“共识与分歧”。导出与返回大厅按钮保持可见。
   - 补组件或页面测试：ended 时默认显示总结；切换后能看到洞察条目；live 时不显示切换项。
2. ≥1600 布局中，洞察列只有 380px，却把“正在形成的共识”和“仍待讨论的分歧”左右并排，每列约 180px，文字挤压。改为在 380px 列中上下堆叠：共识在上，分歧在下，整列独立纵向滚动。1440 的左下洞察面板宽度足够，保持左右并排。

同步 docs/UI-DESIGN.md（结束态面板切换、超宽屏洞察堆叠）。重新运行 `npm run typecheck -w @aps/web`、`npm test -w @aps/web`、`npm run build -w @aps/web`。重拍 `studio-demo-1920.png`、`studio-ended-1920.png`、`studio-ended-1440.png`、`studio-demo-2560.png`，并新增 `studio-ended-insights-1920.png`、`studio-ended-insights-1440.png`（切换到共识与分歧后的画面）。检查页面不整体滚动。约束与之前相同；另一个子代理仍在 server/ 下工作。最后一条消息是完整报告（改动文件、测试数量、截图路径），报告后不要再发其他消息。
```

完整原文：[docs/prompts/08a-ddd-visual-fixes.md](prompts/08a-ddd-visual-fixes.md)。

说明：编排日志记录 1920 截图暴露桌面结束态只能看到洞察计数、看不到条目，以及超宽屏窄列并排挤压。第三轮把这两个具体问题补进设计规范并用截图验收。

## 【TDD 阶段】Prompt 06c · Mock 质量与运行时 Prompt 收尾

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`90d8cb1` feat(prompts): 运行时 Prompt 收尾；`64af7ae` feat(llm): mock 提供商话题无关化与文本自然度。

Prompt 原文摘录：

```text
编排者审读了 `server/src/llm/mock.ts`，单元测试虽然通过，但作为无 Key 演示和 E2E 的数据来源，内容质量不达标：

## 问题
1. 发言与话题无关：rebut、supplement、statement 各只有一句固定文本，并且都写死了编程话题（“基础任务变少不等于培养入口消失”“新人能否独立定位错误”）。换成“城市是否应该全面禁止燃油车？”这类话题，嘉宾仍在谈“新人”和“岗位”。一场 12 轮的讨论里，同一句话会反复出现。
2. 出价是机械轮换：intent 按 callIndex % 4 轮换，每轮出价按座位顺序发起，结果是同一座位永远是同一种意图（E1 总是 rebut，E4 总是 interrupt）。除上一位发言人外人人都想发言，调度结果会变成 E4 与 E1 来回对话，E2、E3 只能等主持人点名。
3. 主持人点错人：invite 与 follow_up 用的是“上一位发言人的姓名”，而不是 targetAlias 对应的嘉宾。开场、bridge、invite 的文案也写死了编程话题。
4. “换一批”换不了人：lineup 每次都取同一组专家，只有主持人姓名轮换。E2E 会检查“换一批后专家姓名发生变化”。
5. 洞察与总结写死了内容（“效率收益与训练机会应如何兼顾”“初级岗位”），与实际发言无关。

## 要求（先在 mock.test.ts 写失败用例，再改实现）
1. 话题无关：utterance、host、insights、summary 不得写死任何具体领域的内容，统一由话题核心短语（去掉问号，最多约 16 字）、阵容名册（姓名、身份、立场）、回应对象最近发言的短引用（最多约 12 字，在标点处截断）和说话人自己的立场要点拼出来。lineup 的职业模板可以继续按话题关键词选择，保留通用兜底。
2. 每种 act 至少 6 个句式模板，主持人每种动作至少 4 个。同一场讨论内，同一模板在全部用完之前不重复（在 provider 实例里按 discussionId 记录，不用模块级变量）。保持 1–2 句、约 80 字以内，opening 不超过 3 句。
3. 出价按立场关系决定：用确定性的哈希（discussionId、callIndex、别名）代替轮换。立场与上一位发言人不同时倾向 rebut，偶尔 interrupt（urgency ≥ 0.85）；相同时倾向 supplement；与主持人发言相关时用 raise_hand。每轮大约只有一半专家想发言，刚发过言的不发言；被点名时必须发言且 urgency ≥ 0.85。urgency 在各自区间内有变化。
4. 主持人：opening 依次点到全部嘉宾的姓名与身份；follow_up 与 invite 使用 targetAlias 对应嘉宾的姓名（invite 还要用到其职业）；bridge 使用分歧双方的姓名与立场。
5. lineup：callIndex 不同（即“换一批”）时，专家姓名必须不同。用姓氏表与名字表按种子组合出不重复的虚构姓名；立场标签至少 3 种，同时包含偏支持与偏反对。
6. 洞察：从真实发言推导。rebut / interrupt 且有回应对象时产生分歧，双方的 position 取自各自立场（不超过 40 字）；supplement 且有回应对象时产生共识，内容概括补充者接着对方说了什么；evidence 为回应对象的那条发言（若在窗口中）加上本条 seq；同一对专家再次交锋时，用已有分歧的 ref 更新。
7. 总结：3–4 段，用话题、嘉宾姓名与洞察区条目拼出；洞察区没有的内容不称为共识。

（中略）

## 附加：运行时 Prompt 的三处收尾（来自第 3 次冒烟 run-3 的审阅）

本阶段不再调用真实模型；下面三项只改 builder 与单元测试，下一阶段的整场真实联调会验证效果。

1. 总结的归属：run-3 的总结写“王思睿……她提到的‘新岗位会出现’”，但王思睿全场没有发言，这句话来自她的立场设定。总结 Prompt 增加规则：只引用发言记录中真实出现的内容；没有发言记录的嘉宾，不得写成“提到”“认为”“指出”，可以写成留给他的问题；“双方都承认”“大家都同意”这类表述只用于洞察区中的共识条目。
2. 总结看到全程：ARCHITECTURE §7.1 已更新为“总结任务提供本场全部发言（最多 40 条；超出时保留开场与最近 39 条）”。`buildSummaryPrompt` 不再截取最后 10 条，改为接受最多 40 条的发言记录（Runner 负责传入）；同步单元测试与 docs/RUNTIME-PROMPTS.md。
3. 抢答的使用条件：run-3 的 20 次出价没有一次 interrupt，演播厅里就永远看不到“抢答”。出价 Prompt 写清：对方刚说完、观点与你的核心立场直接冲突、你迫切要当场回应时，用 interrupt（抢答，urgency ≥ 0.85）；它在整场中偶尔出现，不是常态。同时保留“只有确实无法接受时才抢答”的克制。
```

完整原文：[docs/prompts/06c-mock-quality.md](prompts/06c-mock-quality.md)。

说明：编排日志记录 mock 的固定编程文案、出价轮换、点错人和“换一批”专家不变，直接影响无 Key 演示和 E2E。06c 要求先写失败测试；运行时总结归属与全程回顾的改动进入 `90d8cb1`，mock 部分随后与 06d 合并提交。

## 【TDD 阶段】Prompt 06d · Mock 文本自然度评审

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`64af7ae` feat(llm): mock 提供商话题无关化与文本自然度。

Prompt 原文摘录：

```text
06c 的结构性目标都达到了：点名点对了人、出价随立场关系变化、出现了抢答、“换一批”会换人、总结不误归属。但逐行读 mock-demo-1/2，文本本身仍会让评审者觉得“程序坏了”。

## 现象（摘自 mock-demo 输出）与根因

1. 引用的是模板开头而不是观点。`shortQuote` 截取对方发言第一个标点前的文字，而 mock 生成的发言都以模板套话开头，于是出现“林知夏，你刚才提到“许清和””（引用了一个人名）、“我想立即回应“等一下””、“许清和，你提到“围绕“AI 编程工具会…””（引号嵌套）。同样的引用还进入了洞察（“陆天宇提到“等一下”；林知夏回应“我想立即回应“等一下”””）和总结（“最近，林知夏提到“等一下”。”）。
2. 立场插入的位置不合语法。立场是完整的动词短语（“支持…”“担心…”“认为…”），模板却写成“我更关注{stance}”“我的判断是{stance}”“但{stance}”“我担心{stance}”，得到“我更关注认为岗位会重组”“但支持把助手用于重复编码，但新人…”“我的判断是担心…”。
3. 句中截断。`sentencePoint(stance, 24)` 与 `truncateText(text, 80)` 让发言以“…取决于需求增长和团队…”结尾；`topicCore` 的 16 字截断得到“AI 编程工具会如何改变初级软…”，切在词中间。
4. 话题短语出现太频繁：statement 的 6 个模板都以话题开头，几乎每条发言都是“围绕“…”，…”。
5. 不同讨论的阵容完全相同。姓名只用 callIndex 做种子，任何讨论的第一批嘉宾都是林知夏、许清和、陆天宇、蒋晓峰，主持人都是林知远；主持人与 E1 同姓，名字只差一个字。6 位专家时名字会重复（index × 3 mod 12）。
6. 出价不自洽：出现 `wantToSpeak=false, intent=interrupt, urgency=0.91`。focus 是截断的立场（“支持把助手用于重复编码，但新人仍需…”），会原样显示在专家小窗里。
7. 总结直接拼接洞察行，带出内部编号（“洞察区记录了D1 分歧：…”）。
8. 演示脚本与引擎规则不一致：第 3 轮无人想发言，脚本仍让 E1 发言；按 ARCHITECTURE 应由主持人点名。

## 要求

1. 引用必须是观点原文。凡是放进“”的引用，必须是被引用者某条真实发言的连续子串，至少 4 个字，不含嵌套引号、不含任何嘉宾姓名，也不能是模板套话（等一下、先停一下、我想立即回应、围绕、你提到、刚才说等）。建议做法：先从对方最近发言中去掉引号内文字、姓名、话题短语和已知套话，再取与其立场重合的分句；找不到合格引用时不用引号，改为转述（例如“{姓名}的看法”）。
2. 立场按“谁 + 立场”的语序插入：第一人称写成“我{stance}”，第三人称写成“{姓名}{stance}”。mock 阵容的立场统一以动词开头（支持、有条件支持、担心、认为、反对、主张、倾向）；名册里的立场不以这些词开头时，前面补“认为”。删去或改写所有把立场接在“关注 / 判断是 / 但 / 补充 / 考虑 / 担心 / 从…出发”之后的模板。抢答模板要表达“不同意、要当场回应”，不要写成“我必须补充”。
3. 不截断。发言、主持人发言、洞察和总结的正文中不出现“…”；只有引用超过 12 字被截断时，允许“…”紧挨在后引号之前。立场要点取立场的第一个分句；mock 自己生成的立场保证第一个分句不超过 20 字。话题短语在 24 字以内时不截断，更长时在标点处截断。
```

完整原文：[docs/prompts/06d-mock-text.md](prompts/06d-mock-text.md)。

说明：编排日志记录 06c 达成结构性目标后，人工通读仍发现引用了“等一下”等模板套话、病句、截断和重名。06d 将这些可感知问题改成逐项可断言的文本规则。

## 【TDD 阶段】Prompt 06d · 补充更正：总结无共识时不写说明句

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`64af7ae` feat(llm): mock 提供商话题无关化与文本自然度。

Prompt 原文摘录：

```text
8. 总结 3–4 段：① 话题与已发言嘉宾各自的观点（“{姓名}{立场要点}”）；② 分歧（把洞察区的分歧条目改写成自然语言）；③ 共识（洞察区有共识条目时才写，否则写“本场尚未形成明确共识”）；④ 留给未发言嘉宾的问题与致谢。正文不出现 C1、D1 之类的内部编号，不出现“…”。
9. 主持人。opening 点到全部嘉宾之后，用一句话把话交出去（交给第一位发言者，或邀请大家先亮出判断），总共不超过 3 句。follow_up 用“从{职业}的角度”这类自然说法。bridge 写成“{A}{A 的立场要点}，{B}则{B 的立场要点}”，再请目标嘉宾回应。

## 测试（mock.test.ts，先红后绿）

- 引用保真：编程话题与燃油车话题各跑一场 12 条发言的流程（包含 rebut、supplement、interrupt、follow_up、bridge），收集 utterance、host、insights、summary 的全部输出，逐个检查“”内文字满足要求 1。

（中略）

同 06c：`npm run typecheck -w @aps/server`；`npm test -w @aps/server -- src/core src/llm src/prompts src/db src/config.test.ts src/app.test.ts` 全绿。报告附两个话题各 8 条连续发言原文（含主持人）、全部洞察条目与完整总结。

## 约束

只改 `server/src/llm/mock.ts`、`server/src/llm/mock.test.ts` 与仓库外的演示脚本。另一个子代理正在 `web/` 下工作，只运行 `-w @aps/server` 的命令。不提交 git，不安装依赖，不读取 `server/.env`，不调用真实模型。

## 补充更正（发出约 1 分钟后由编排者追加）

要求 8 第 ③ 段与运行时总结 Prompt 冲突：运行时 Prompt 明确“不要写‘目前尚无已确认的共识’这类说明性语句”。mock 应与真实总结的写法一致：洞察区有共识条目时，第 ③ 段写共识；没有时，这一段改写为仍待回答的开放问题（例如某处分歧接下来该核实什么），不写“尚未形成共识”之类的说明句。相应测试：洞察区没有共识条目时，总结不出现“共识”二字。
```

完整原文：[docs/prompts/06d-mock-text.md](prompts/06d-mock-text.md)。

说明：编排日志记录编排者在 06d 发出约一分钟后发现自己的总结要求与运行时 Prompt 冲突，立即中止并追加更正，再续跑同一子代理。这个回路把 Prompt 编写者本身也纳入审查。

## 【DDD 阶段】Prompt 08 · 前端接入真实 REST 与 SSE

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`634d125` feat(web): 前端接入真实 REST 与 SSE——HTTP 客户端、事件流重连与页面接线。

Prompt 原文摘录：

```text
> 为什么在后端完成后再接：DDD 阶段已经用与真实 SSE 同构的事件剧本把 UI 和状态流转打磨好。这一步只替换数据源，任何“换源后才出现”的问题都能直接定位到接入层，而不是 UI 层。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md`、`docs/API.md`、`docs/UI-DESIGN.md`，再读 `web/src` 的 api、state、mocks、pages，确认 `DiscussionApi` 与 `DiscussionEventSource` 两个抽象的现有签名。
- 后端已完成并有完整测试。接口、错误码、事件字段一律以 `docs/API.md` 为准。

## 1. 实现

### 1.1 `api/httpApi.ts`（实现 `DiscussionApi`）

- 用 fetch 请求 `/api/...`，方法与 API.md §3 一一对应。
- 成功响应用 `@aps/shared` 的 zod schema 做 `safeParse`。解析失败时抛出前端错误“服务返回了无法识别的数据”。
- 错误响应解析为 `ApiErrorBody`，转成前端的 `ApiError(code, message, details)`，message 原样展示。
- 网络失败时 code 为 `NETWORK`，提示“无法连接服务器，请确认后端已启动”。`NETWORK` 只存在于前端的错误类型里，不要改 shared。

### 1.2 `state/sseEventSource.ts`（实现 `DiscussionEventSource`）

- 构造参数：discussionId、起始游标 `since`（来自快照的 `lastEventSeq`）、可注入的 EventSource 构造器（测试用）。
- URL：`/api/discussions/:id/stream?since=<seq>`。消息 `data` 先 JSON 解析，再 `StreamEventSchema.safeParse`；不合法的消息丢弃（开发环境下 console.warn）。持久事件的 seq 取自 `lastEventId`。
- 连接状态：connecting → open → reconnecting（浏览器自动重连期间，会自动带上 Last-Event-ID）→ closed。进入 CLOSED 后按 1s / 2s / 5s 退避，用最新的持久 seq 新建连接。取消订阅时关闭连接并清理定时器。
- reducer 仍按 seq 去重持久事件。补发与实时事件重叠时不会产生重复条目。

### 1.3 页面接线

- 大厅：真实列表；页面可见时每 5 秒刷新一次（`document.visibilityState`）；有加载、错误（可重试）与空状态。
- 新建页：
  - 创建（使用 v4-pro，阵容生成约需 8–15 秒）时显示骨架屏和“正在邀请嘉宾入场…”。
  - 阵容确认支持“换一批”；“确认阵容，进入演播厅”调用 start 并跳转。
  - 生成失败时显示中文错误，并用 `details[0].discussionId` 重新生成。
- 演播厅：
  - GET 快照后，用 sseEventSource 驱动 `useDiscussion`。
  - 控制按钮调用 start / pause / resume / end。请求进行中禁用按钮；结束讨论需二次确认。
  - 收到 409 时重新拉取快照，并提示“状态已变化，已刷新”。
  - 讨论不存在时显示 404 页面和返回大厅入口；讨论被删除（流被关闭且快照为 404）时提示后返回大厅。
- `/studio/demo` 继续使用 mockScript 回放。导出 Markdown 基于真实快照。
```

完整原文：[docs/prompts/08-web-integration.md](prompts/08-web-integration.md)。

说明：08 将已经通过 mock 事件剧本验证的前端状态流接到 HTTP 与 SSE。编排日志记录首轮接入后按真实用户操作序列审查，暴露了控制操作和网络代理错误的边界情况。

## 【DDD 阶段】Prompt 08 · 续派 1：控制操作快照与无后端提示

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`634d125` feat(web): 前端接入真实 REST 与 SSE。

Prompt 原文摘录：

```text
## 派发说明（编排者）

本 Prompt 分两次执行：第一部分（§1.1–§1.3、§1.5、§2 与 dist 安全检查）在后端引擎完成之前派发，与只改 `server/src/llm/mock*` 的 06d 并行；§1.4 的代理目标验证与 §3 全栈联调在 Prompt 07 完成后续派。

## 续派 1（编排者审阅第一部分代码后，resume 同一子代理）

编排者审阅了你的产出：httpApi、sseEventSource、大厅轮询、新建页失败重试、404/删除处理和角标修复都合格。还有两处问题需要修，仍然只改 web/、只运行 `-w @aps/web` 的命令（另一个子代理在 server/ 下工作）。

1. 【严重】控制操作成功后会清空演播厅已收到的内容。`StudioSession.runControl` 成功后调用 `onSnapshot({ ...snapshot, discussion })`，这里的 `snapshot` 是页面首次载入时的快照；`useDiscussion` 的 `useEffect(() => dispatch({ type: 'replace', snapshot }), [snapshot])` 随即用它整体替换 reducer 状态。结果是：开播后通过 SSE 收到的发言、洞察与专家状态，在用户点击“暂停 / 继续 / 结束”的瞬间全部消失，而 SSE 不会重发这些事件（`lastEventSeq` 也被退回到旧值）。
   - 修改：成功路径不要替换快照。在 `useDiscussion` 中增加一个只合并 `discussion` 对象的动作（例如 `patchDiscussion`），把接口返回的 `discussion` 合并进当前状态；只有当返回的 `updatedAt` 不早于当前状态的 `discussion.updatedAt` 时才合并，避免覆盖 SSE 已经送达的更新状态。409 后重新拉取快照再替换的路径保持不变（那里用的是新快照，是正确的）。
   - 回归测试：快照 → SSE 送达 2 条发言 → 点击暂停 → Transcript 仍显示这 2 条发言且状态为“已暂停”；以及“SSE 先送达了更新的状态、接口响应较旧”时状态不倒退。

2. 后端未启动时提示不对。开发模式下请求经过 Vite 代理，后端不可达时 fetch 不会抛网络错误，而是收到代理返回的 5xx 响应且响应体不是 JSON，当前代码会显示“服务返回了无法识别的数据”，而不是 NETWORK 的“无法连接服务器，请确认后端已启动”。
   - 先实测：不启动后端，只用 fireAndForget 启动 `npm run dev -w @aps/web`，请求 `http://127.0.0.1:5173/api/health` 与 `/api/discussions`，记录状态码、Content-Type 与响应体（写进报告）。
   - 修改：响应为 5xx（500/502/503/504）且响应体不能解析为 `ApiErrorBody` 时，转为 `NETWORK`。后端自己返回的 JSON 错误（例如 `502 LLM_ERROR`）保持原样。补单元测试覆盖这两种情况。
   - 在同一个无后端的 dev server 上用 Playwright（Edge）截取大厅 1440×900 `lobby-no-backend-1440.png` 到 C:\Users\123\Desktop\mianshiti\_review\web\，确认显示 NETWORK 提示与重试按钮。截完按 PID 停掉 dev server，确认 5173 端口释放。

完成后运行 `npm run typecheck -w @aps/web`、`npm test -w @aps/web`、`npm run build -w @aps/web`，并重新做 dist 安全检查。约束不变：不改 shared/、server/、docs/；不安装依赖；不读取 server/.env；不提交 git。报告：改动文件、两处修复的说明、实测的代理响应、测试数量与结果、截图路径。
```

完整原文：[docs/prompts/08-web-integration.md](prompts/08-web-integration.md)。

说明：编排日志记载旧快照整体替换会让用户点击暂停后丢失已由 SSE 收到的内容；另一个实测发现 Vite 在无后端时返回 502、text/plain。续派要求先复现，再对两条路径分别加回归测试。

## 【DDD 阶段】Prompt 08 · 续派 2：总结竞态与 SSE 测试稳定性

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`b202f06` fix(web): 结束讨论时 REST 响应不再清空已收到的总结；修复 SSE 测试偶发失败。

Prompt 原文摘录：

```text
## 续派 2（Prompt 07 交付后，resume 同一子代理；本次只修前端，联调另行续派）

后端引擎（Prompt 07）已经交付，另一个子代理正在 `server/` 下修问题，所以这次不要启动后端，也不要做全栈联调（§1.4 与 §3 之后再续派）。只改 `web/`，只运行 `-w @aps/web` 的命令。

1. 【严重】结束讨论时，已收到的总结可能被清空。时序如下：用户点击“结束并生成总结”→ 服务端转为 summarizing，推送 `discussion.status(summarizing)`（reducer 把 `updatedAt` 设为事件的 `at`）→ mock 或较快的模型很快生成总结，推送 `summary.completed`（reducer 只写 summary，不更新 `updatedAt`）→ 推送 `discussion.status(ended)`。如果 `POST /end` 的 202 响应恰好在 `summary.completed` 和 `discussion.status(ended)` 之间到达，响应里的 `discussion`（status 为 summarizing、summary 为 null、`updatedAt` 等于 summarizing 事件的 `at`）并不早于当前状态，`patchDiscussionState` 会合并它，把已收到的总结清空；之后的 ended 事件不带 summary，总结区一直空着，直到刷新页面。后端约定：控制接口返回的 `updatedAt` 不早于对应 `discussion.status` 事件的 `at`；SSE 事件可能先于 REST 响应到达。
   - 修改：REST 响应永远不能让状态倒退，也不能清空已经收到的数据。至少做到：`summary.completed` 也推进 `updatedAt`；`patchDiscussionState` 遇到时间戳相等时不覆盖（相等说明 SSE 已经应用了同一次变更）；不用 null 覆盖已有的 summary；status 不从 summarizing 或 ended 退回更早的阶段（状态先后顺序如果 shared 没有合适的常量，就在 web 内定义，不改 shared）。
   - 回归测试（reducer 单测加一个页面级测试）：end 响应分别在 `summary.completed` 之前、`summary.completed` 与 ended 之间、ended 之后到达，三种顺序下最终都是 ended 且总结可见；start 响应晚于 `discussion.status(live)` 和第一条发言到达时，状态和发言都不倒退。

2. 【测试偶发失败】`pages.integration.test.tsx` 的 “keeps SSE transcript entries when pausing after two new utterances” 在编排者运行根目录 `npm test` 时失败过 1 次：标题出现后立刻读取 `StubEventSource.instances[0]`，而 `useDiscussion` 的 effect 可能还没建立连接，于是拿到 undefined。改成先 `await waitFor(...)` 等实例出现再推送事件；同文件第 223、380 行附近以及其他测试文件里，凡是“刚渲染就读取 instances”的写法一并修正。修完后连续运行 `npm test -w @aps/web` 3 次，全部通过。

3. 【核对】后端将把总结改为流式推送。summarizing 期间会先收到 act 为 `closing` 的 `utterance.started` 和多条 delta；如果某次生成失败重试，会再收到一条新的 `utterance.started`（新的 utteranceId）；最后是 `utterance.completed` 和 `summary.completed`。用事件序列测试确认演播厅在这段时间表现合理：实时字幕逐步显示总结正文；收到新的 started 时旧字幕被替换；完成后实时字幕不残留，Transcript 的 closing 条目与总结区内容一致。不符合的地方做调整并补测试。

完成后运行 `npm run typecheck -w @aps/web`、`npm test -w @aps/web`（连续 3 次）、`npm run build -w @aps/web`，并按续派 1 的方法重新做 dist 安全检查。约束不变：不改 shared/、server/、docs/；不安装依赖；不读取 server/.env；不提交 git；不启动后端。报告：改动文件、各项修复的说明、新增测试与结果、3 次测试运行的结果、dist 检查结果。

## 派发说明补充（编排者，Prompt 07 交付后）

- §1.4 由编排者直接验证，不再续派：后端只监听 `127.0.0.1:8787`，Vite 默认代理目标是 `http://localhost:8787`；本机 `localhost` 依次解析为 `::1` 与 `127.0.0.1`，代理会回退到 IPv4。经 5173 访问 `/api/health` 与 `/api/discussions` 都返回 200 JSON；SSE 经开发代理逐条到达（25 秒内 14 个 delta 落在 14 个不同的 50 ms 时间段），没有被缓冲。默认值无需修改。检查脚本：`C:\Users\123\Desktop\mianshiti\_review\live\proxy-sse-check.mjs`。
- §3 全栈联调与 Prompt 09 重叠：09 用真实浏览器走完“浏览器 → Vite → Express → 引擎 → SQLite → SSE”整条链路并截图，还包含 1 次真实模型场景。因此 §3 并入 Prompt 09 执行，不再单独续派，也省下 1 次 DeepSeek 调用。
```

完整原文：[docs/prompts/08-web-integration.md](prompts/08-web-integration.md)。

说明：编排日志记录该续派把总结 completed 推进时间戳、处理相等与更早响应，并让页面测试等待 SSE effect 建立。编排者复跑 web 类型检查与测试后提交 `b202f06`。

## 【TDD 阶段】Prompt 07 · Green（二）：讨论引擎、REST 与 SSE

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`d6aabc4` feat(server): 讨论引擎、事件总线、REST 与 SSE 落地，mock 与 DeepSeek 整场联调通过。

Prompt 原文摘录：

```text
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
```

完整原文：[docs/prompts/07-tdd-green-engine.md](prompts/07-tdd-green-engine.md)。

说明：编排日志记录首轮审查检查了事务内持久化、SSE 补发顺序和讨论隔离；首轮还暴露总结未流式、最后一条正文可能是主持人问题和阵容生成并发竞态。续派 1 修复并补回归测试后统一提交。

## 【TDD 阶段】Prompt 07 · 续派 1：并发保护、流式总结与最后一轮

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`d6aabc4` feat(server): 讨论引擎、事件总线、REST 与 SSE 落地。

Prompt 原文摘录：

```text
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
```

完整原文：[docs/prompts/07-tdd-green-engine.md](prompts/07-tdd-green-engine.md)。

说明：编排日志记录这轮逐项修复 5 个问题，并批准一次真实 DeepSeek run-4 验证收紧后的 Prompt 和流式总结。mock 联调与 run-4 检查通过后，主代理复跑全栈类型检查和测试并提交 `d6aabc4`。

## 【TDD 阶段】Prompt 07 · 续派 2：换一批失败保留与抢答额度

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`4f40e75` feat(server): 抢答额度改由 Runner 控制；换一批失败时保留原阵容。

Prompt 原文摘录：

```text
## 续派 2（编排者审阅续派 1 并提交 d6aabc4 后，resume 同一子代理）

续派 1 的 5 项修复已审查通过并提交（d6aabc4）。编排者复跑了根目录 typecheck 与 `npm test`（shared 11、server 185、web 55 全绿），用你的脚本重跑 mock 全流程（含新增 3 项检查）全部通过，也通读了 run-4：总结流式、最后一条正文来自专家、讨论质量都达到预期。还剩下面两个问题。规格已由编排者先行修订；本次除 `docs/RUNTIME-PROMPTS.md` 外不改 `docs/` 下的文件，发现规格仍有矛盾时在报告中指出。

### 1. 【体验】“换一批”失败会毁掉一套可用的阵容

现状：讨论处于 `lineup_ready` 时调用 regenerate，模型最终失败后讨论变为 `failed` 并写入 error_message。前端 `regenerate()` 失败时保留旧阵容，“确认阵容，进入演播厅”只看本地快照的 `lineup_ready`，仍然可以点；用户一点就收到 409，“重试进入演播厅”也会一直 409，只有再换一批成功才能继续。规格本身也矛盾：API.md §5 状态表和 ARCHITECTURE §4 状态图都没有 `lineup_ready → failed`。

已修订的规格：API.md §3.5 末段与 §3.6 的“可能错误”、PRD F2 交互要点与新增的 AC-F2-7、TEST-PLAN 的 AC-F2-7 行、ARCHITECTURE §7.1 第 4 条。要求：

- 从 `lineup_ready` 换一批最终失败：返回 `502 LLM_ERROR`，`details` 仍带 `discussionId`，message 为「换一批失败，已保留当前阵容，可以重试或直接确认开播」；讨论保持 `lineup_ready`，参与者、`error_message`、`updated_at` 都不变，不追加任何事件；互斥照常释放。
- 从 `failed` 重新生成仍失败、创建讨论时失败：保持现状。
- 回归测试（`server/src/routes/api.test.ts`，标题用「待开播讨论换一批失败时保留原阵容与状态且仍可开播」，TEST-PLAN 已按此标题映射）：先成功创建，再让 lineup 任务失败并调用 regenerate，得到 502，校验 code、message 与 `details[0].discussionId`；随后取快照：状态 `lineup_ready`、参与者 ID 与失败前完全相同、`errorMessage` 为 null、`lastEventSeq` 不变；再调用 start 得到 200，状态 `live`，参与者仍是原阵容。现有的「阵容失败保留 failed 状态和讨论 ID 且之后可重新生成」保持通过。
- 前端不用改：失败时页面保留旧阵容并显示服务端 message；Prompt 09 的 E2E 会用路由拦截覆盖这一点。

（中略）

### 2. 【质量】真实模型下，抢答要么泛滥要么消失

数据：run-3 的写法（“上一位专家刚发言且存在具体、迫切的核心冲突时选 interrupt”）让模型把所有即时反驳都标成 interrupt：interrupt 3 次、rebut 0 次，还有 3 次“等一下”起句。收紧后 run-4 约 40 次出价没有一次 interrupt。只改措辞会在两个极端之间摆动，所以改为“代码管额度，Prompt 给可操作的条件”。已修订的规格：ARCHITECTURE §3.1 伪代码、§5.B 最后一条、§7.1 第 1 条，PRD 术语表。

- 引擎兜底：每场 `interrupt` 正文发言最多 `max(1, floor(maxTurns / 6))` 次（MAX_TURNS 为 12 或 16 时是 2 次）。额度用完，或上一条正文发言的 act 就是 `interrupt` 时，把本轮出价中的 `interrupt` 改为 `rebut`，其他字段不变；改写放在推送 `participant.state` 之前，保证小窗意图与正文 act 一致。判断写成 `server/src/core` 下的纯函数并单测：额度计算、额度用完、上一条是 interrupt、主持人插话后恢复、允许抢答时原样保留。runner 测试至少覆盖：额度用完后 interrupt 出价以 rebut 发言，且 `participant.state` 的 agentIntent 也是 rebut；不会出现两条相邻正文都是 interrupt。

```

完整原文：[docs/prompts/07-tdd-green-engine.md](prompts/07-tdd-green-engine.md)。

说明：编排日志记录换一批失败曾使 `lineup_ready` 讨论失去可用阵容，并指出 run-3/run-4 抢答在泛滥与消失间摆动；续派据此保留原阵容与状态，并将抢答额度收敛到 Runner 规则。

## 【TDD 阶段】Prompt 07 · 续派 3：出价格式重试与行为多样性

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`f5ee7fa` feat(server): 出价格式失败重试一次；调度增加发言行为多样性加成。

Prompt 原文摘录：

```text
## 续派 3（编排者审查续派 2 并提交 4f40e75 后，resume 同一子代理）

续派 2 已审查通过并提交（4f40e75）。编排者复跑时又遇到一个依赖随机种子的用例偶发失败（「专家正文发言至少覆盖两种发言行为」），已按你处理洞察用例的方式固定 Runner RNG 和 mock 使用的讨论 ID，断言不变；之后 server 全量用例连续 8 次通过。run-5 留下的两个问题这次处理。规格已由编排者先行修订：ARCHITECTURE §5.C、§5.1、§8.2，TEST-PLAN 的 AC-F3-2 行、§3 的 C 行与 runner 行、§4 故障注入，RUNTIME-PROMPTS 出价一节的“输出与校验”。先读这些改动再动手；本次不改 `docs/` 下的任何文件，发现规格仍有矛盾时在报告中指出。

### 1. 【健壮性】出价格式失败要重试 1 次

现状：run-5 有 5 次出价失败，类别都是“JSON 解析失败”。网关对 bid 已开启 `response_format: json_object`；DeepSeek 文档说明，JSON 模式下模型输出不是合法 JSON 时，API 会把内容替换成空格，返回的 content 看起来是空的（finish_reason 仍可能是 stop），建议代码遇到空白内容时重试。ARCHITECTURE §7.1 早已写明“JSON 任务失败重试 1 次”，但 §8.2 的出价一行没有写，实现也没有重试；§8.2 现已统一。要求：

- 只在 `parseJsonLoose` 抛出 `LLMFormatError` 时，用同一 Prompt 立即重试 1 次，并采用重试结果。请求错误（网络、429、5xx、超时）已由网关处理，Runner 不再额外重试；能解析但字段无效时仍走 `normalizeBid` 的默认值。
- 重试后仍无法解析，才按现有路径处理：记失败日志、小窗回到 idle、本轮视为不发言；一轮全部出价都失败时计一次失败轮次。讨论已暂停、结束、停止或删除时不再发起重试。
- 诊断：格式失败的日志增加 `contentLength=<字符数>`（只记长度，不记内容），用来区分空白内容与非 JSON 文本；`APS_REPORT_BID_METRICS=1` 时另外输出格式失败次数、重试成功次数、重试后仍失败次数。
- 测试（`server/src/engine/runner.test.ts`，先红后绿）：
  - 「出价返回无法解析的内容时重试一次并采用重试结果」：包装 provider，让某位专家第一次出价返回只含空格的内容、第二次返回想发言的有效 JSON；断言这位专家这一轮的出价请求恰好 2 次，并且重试结果参与了调度（例如小窗出现对应意图，或该专家被选中发言）。
  - 「出价重试后仍无法解析时视为本轮不发言且其余专家正常调度」：某位专家的出价始终返回非 JSON；断言每轮对它最多请求 2 次，讨论正常推进到结束，没有因此暂停。
  - 已有的「连续三轮出价任务失败后暂停广播错误且不新增正文发言」保持通过（它注入的是请求错误，不会触发格式重试）。

### 2. 【质量】补充几乎不可能胜出

现状：run-5 有 7 次想发言的 supplement 出价，正文 supplement 0 条；run-2 也是 0 条。按 §5.C 的打分，rebut 的意图权重是 0.30、supplement 是 0.15，反驳出价的 urgency 通常也更高，所以只要同一轮有人想反驳，补充几乎不会胜出，演播厅里很少看到“补充”。已修订的规格（§5.C、§5.1）：

- `SchedulerInput` 增加可选的 `recentExpertActs`：最近 3 条专家正文发言的 act，按时间正序，不含主持人发言、开场与总结；省略时视为空。
- 出价对应的发言行为（`raise_hand` 记为 `statement`）不在 `recentExpertActs` 中时，加 `SCHEDULER_WEIGHTS.actVarietyBonus = 0.25`；`recentExpertActs` 为空时不加。窗口大小 `ACT_VARIETY_WINDOW = 3` 与权重一起从 `server/src/core/scheduler.ts` 导出。其他权重不变。
- Runner 从持久化的发言计算 `recentExpertActs`（与抢答额度一样，重启恢复后结果一致）。把计算写成纯函数并单测：只取专家正文，主持人插话、开场与总结不计入；取最近 3 条；按时间正序。
- 测试（`server/src/core/scheduler.test.ts`，标题用「最近三条专家正文未出现的发言行为获得多样性加分」，TEST-PLAN 已按此标题映射）：同一组出价（rebut 与 supplement 都回应上一位发言人，rng 固定返回 0），`recentExpertActs` 为 `['rebut', 'rebut', 'statement']` 时 supplement 胜出，为 `['supplement', 'rebut', 'statement']` 时 rebut 胜出；另断言 raise_hand 按 statement 判断、空窗口不加分。数值请按 §5.C 的表手算后再写，避免依赖并列裁决。
- 已有的 scheduler 用例应保持通过（它们不传 `recentExpertActs`，按空窗口处理）。runner 用例如果因为调度结果变化而失败，先确认是否只是依赖了某个随机结果；可以固定种子，但不能放宽断言；确需修改时写明原断言 → 新断言 → 依据。
- 不要改 `server/src/llm/mock*`：随后的 06e 会在新的调度规则下调整 mock。

```

完整原文：[docs/prompts/07-tdd-green-engine.md](prompts/07-tdd-green-engine.md)。

说明：编排日志记录 run-5 的 5 次出价格式失败均未重试，且 7 次想发言的 supplement 未能胜出；续派 3 因而只在 `LLMFormatError` 时重试一次，并增加最近三条专家正文未出现过的行为加分。run-6 的 5 次格式失败均经一次重试恢复，但 run-5 与 run-6 仍都未生成共识。

## 【TDD 阶段】Prompt 07b · 错误响应契约评审：`details` 始终为数组

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`7fb13e7` fix(server): 所有错误响应统一带 details，前端不再丢失服务端中文提示。

Prompt 原文摘录：

```text
## 背景

Prompt 10 第二部分 A 在对齐 API.md 与实现时发现：`shared/src/api.ts` 的 `ApiErrorBodySchema` 要求 `error.details` 是数组，且对象为 strict；API.md §1 的错误格式示例也一直带 `"details": []`。但服务端有三处错误出口，在没有附加信息时省略了 `details`：

- `server/src/app.ts`：errorHandler（zod 校验失败、JSON 解析失败、500 INTERNAL）和末尾的 404「接口不存在」；
- `server/src/routes/discussions.ts` 的 `sendError`：只有传入 details 时才写这个字段，所有 400、404、409、500 路径都没传；
- `server/src/routes/stream.ts` 的 `sendError`：从不写 `details`（SSE 建流前的 404 和 400「事件游标无效」）。

前端 `web/src/api/httpApi.ts` 的 `readApiError` 用 `ApiErrorBodySchema` 严格解析。解析失败时，5xx 变成 NETWORK「无法连接服务器，请确认后端已启动」，其他状态变成 INTERNAL「服务返回了无法识别的数据」。结果是服务端给出的中文 message 全部丢失。例如用户在换一批进行中点击开播，服务端返回 409「阵容正在更新，暂时无法开播」，页面却显示“服务返回了无法识别的数据”。

（中略）

## 决定（规格已由编排者先行修订）

以契约为准修服务端，`shared/` 和 `web/` 不改：所有错误响应都带 `details`，没有附加信息时为 `[]`。已修订的规格：API.md §1「通用错误格式」（删除了“待处理的不一致”说明），TEST-PLAN §3 的 REST 一行。先读这两处再动手。本次不改 `docs/` 下的任何文件，发现规格仍有矛盾时在报告中指出。

## 要求

1. 新建 `server/src/routes/errors.ts`，导出唯一的错误出口，例如 `sendApiError(response, status, code, message, details = [])`。`code` 使用 `@aps/shared` 的 `ApiErrorCode` 类型，响应体用 `ApiErrorBody` 类型标注，让类型检查保证字段齐全。
2. `app.ts` 的 errorHandler 与 404、`discussions.ts`、`stream.ts` 全部改用它，删掉两个本地 `sendError`。状态码、code、message 与现有行为完全一致；现有 502 响应中带 `discussionId` 的 details 保持不变。

（中略）

## 测试（先红后绿）

- `server/src/routes/api.test.ts` 新增「各类错误响应均符合共享错误契约且 details 始终为数组」。逐个触发下列错误，对每个响应体断言 `ApiErrorBodySchema.safeParse(body).success` 为 true，状态码和 code 符合 API.md；除 502 外，`details` 都等于 `[]`。
```

完整原文：[docs/prompts/07b-error-body-contract.md](prompts/07b-error-body-contract.md)。

说明：编排日志记载，第二部分 A 对齐文档时发现服务端三处错误出口省略 `details`，前端严格解析后把服务端中文 message 全部丢失；编排者以契约为准先行修订 API.md 与 TEST-PLAN，再派 07b 先红后绿统一错误出口，并用独立 worktree 验证该提交单独成立。

## 【TDD 阶段】Prompt 06e · Mock 讨论走向：观点推进、补充与共识、主持串联

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`16d238f` chore: 接手快照（首轮与续派 1 产出）；`ee3f5b0` fix(server): llm-smoke 脚本补传 lastInterventionAct；`80f52f0` feat(llm): mock 讨论质量收口（续派 2）。

Prompt 原文摘录：

```text
> 为什么还要一轮：README 会告诉评审者“没有 Key 也能用 mock 演示”，E2E 也全部基于 mock。06c、06d 之后每一句话都通顺了，但把 10 轮连起来读（`C:\Users\123\Desktop\mianshiti\_review\smoke\mock-demo-1.txt`），讨论没有推进：每个人一直在重复自己的立场，没有人表示认同，主持人的串联也问错了人。

## 现象（摘自 mock-demo-1）、根因与要求

### 1. 观点推进：不再复读立场

- 现象：沈怀瑾三次发言都是“我担心基础任务减少会挤压新人练习”（#3、#6、#11），罗沐言三次都是“我反对把代码生成当作新人替代品”（#4、#10、#13）；其余部分是“还要核实实际影响”“关键条件还没有说清”“不能只凭一个条件下结论”这类不含信息的套话。
- 根因：每个 profile 只有一条 stance，发言模板都是“套话 + 我{stance}”。
- 要求：
  - 每个 profile 增加至少 4 条论据。每条论据是一句具体、能独立成立的观点，角度互不相同（例如适用条件、风险或代价、例子或证据、落地做法），方向与 stance 一致。编程、客服、通用三类话题的全部 profile 都要写；通用 profile 的论据不出现具体行业名词，可以从职业视角出发。
  - 专家第一次发言用 stance 亮明立场；之后每次使用自己下一条还没用过的论据；论据用完后，针对回应对象最近一条发言的具体内容作答（引用仍遵守 06d 的规则）。

（中略）

### 2. 立场方向：要有补充，也要有共识

（中略）

- 要求：
  - mock 沿用与真实出价完全相同的方向分类，不另立规则。mock 不能直接调用 prompts 的内部函数时，保持 `mockStanceRelation` 与 `stanceDirection` 的规则一致，并用测试保证两者对同一批标签给出相同的 relation（例如构造出价 Prompt，读取其中的 relation 文本来对照）。

（中略）

## 续派 1（编排者通读首轮三场整场记录之后）

（中略）

## 续派 2（编排者审查续派 1 之后；mock 讨论质量的最后一轮）

（中略）

### F2. 反驳、补充和洞察要与“在议题上站哪一边”一致

（中略）

根因：论据只标了议题，没有标“在这个议题上站哪一边”。方向只按人（stanceTag）分类，可同一个人的论据可能站在议题的另一边（例如 `mockProfiles.ts` 里“有条件支持”的陈澄，论据“新人仍要独立从报错定位原因”站的是偏谨慎的一边）。mock 按人的方向或哈希决定反驳还是补充，洞察又按发言行为生成，于是出现上面的错位。

要求：

1. 每个议题定义两个相反的取向（简短短语，例如“哪些任务可交给助手”：“低风险任务先交给助手 / 基础任务先让新人自己做”），每条论据标注它站在哪个取向（例如字段 `side`）。方向为支持或反对的 profile，4 条论据的取向都与其方向一致；中立、谨慎的 profile 两种取向都要有。需要时改写论据，仍满足 C 节（议题短语）与 C2。
```

完整原文：[docs/prompts/06e-mock-discussion-flow.md](prompts/06e-mock-discussion-flow.md)。

说明：编排日志记载，首轮交付后编排者逐条通读三场整场记录，把引用截断、问答接不上、客服场没有补充与共识转成每场检查，并新增引擎例外让追问稳定出现；续派 1 执行中因模型额度耗尽中断，新会话按原任务书接手并以快照 `16d238f` 固定进度，续派 2 是 mock 质量的最后一轮，收口于 `80f52f0`。

## 【E2E 阶段】Prompt 09 · Playwright 系统级端到端测试与质量闭环

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：`5421a22` fix(server): 洞察立场按座位排序、同毫秒洞察按写入顺序，E2E 增加可复现讨论 ID；`179aca1` test(e2e): Playwright 端到端九个场景与质量闭环。

Prompt 原文摘录：

```text
> 为什么 E2E 放在最后：单元测试证明“规则对”，E2E 证明“用户看到的对”。演播厅的核心体验（非机械轮流、实时状态、Transcript 不暴露内部事件、实时共识分歧、总结无 JSON、多讨论隔离、区域独立滚动、Key 不出后端）只有在真实浏览器里跑通整条链路才能被证实。Prompt 08 §3 的全栈联调截图也并入本阶段完成（见 08 文件末尾的派发说明补充）。

（中略）

## 2. 场景（每个场景在 `docs/TEST-PLAN.md` 中对应到 AC 编号）

（中略）

8. `discussion-quality.spec.ts`（API 层面，跑完一场后取快照）：
   - 没有同一专家连续两条发言，且专家发言顺序不是按座位轮转。
   - 专家发言与主持人插话 ≤ 2 句，开场 ≤ 3 句。
   - 至少 1 次主持人插话（追问 / 串联 / 点名）；专家发言的 act 至少有 2 种。
   - 达到轮次上限自然结束时，最后一条正文发言来自专家（主持人不在最后一轮提问后无人回答）。
   - 抢答额度（ARCHITECTURE §5.B）：act 为 `interrupt` 的正文发言不超过 `max(1, floor(maxTurns / 6))` 条，且没有两条相邻的正文发言都是 `interrupt`。
   - 总结流式推送：在同一场讨论的 SSE 记录中，act 为 `closing` 的发言有多条 delta，且第一条 delta 早于 `summary.completed`。

（中略）

## 3. 质量闭环

- `npm run test:e2e` 连续运行 2 次，都必须全部通过（真实模型场景除外）。若有偶发失败，修正等待条件，不要加重试。
- E2E 发现的产品缺陷：在 web 或 server 中修复，并补一个能复现该缺陷的单元或集成回归测试。报告中逐条列出：现象 → 根因 → 修复 → 回归测试。
- 最后在仓库根目录运行 `npm run typecheck` 和 `npm test`，确认全绿。
- 用 `E2E_SHOTS_DIR=C:\Users\123\Desktop\mianshiti\_review\e2e` 再跑一次，生成审查截图。

（中略）

## 派发补充（编排者，07 续派 3 与 06e 之后）

（中略）

1. 随机性：E2E 里讨论 ID 每次随机生成，Runner 的 RNG 和 mock 的种子都由它派生，所以每次运行的讨论走向都不同，质量断言必须对任意种子成立。runner 单测已经出现过两次“某些种子下不成立”的偶发失败（洞察更新、专家正文 act 种类），都靠固定种子解决。`discussion-quality` 里“专家发言的 act 至少有 2 种”“结束前出现共识或分歧”这类统计性质，如果只在多数种子下成立，不要靠重试：要么把断言改成规格保证的性质，要么为 E2E 提供确定性（例如服务端读取一个仅供测试、默认关闭的环境变量来固定 mock 与 Runner 的种子），并在报告中说明理由与改动。

（中略）

6. 主持人串联与追问交替（06e 续派 1 的 G 节，ARCHITECTURE §5.D 第 2 步）：专家连续发言 3 条后，如果最近一次 bridge / follow_up 插话是 bridge，就追问上一位专家；否则有 active 分歧时串联。因此：
   - `discussion-quality` 增加一条只依赖规格、任意种子都成立的断言：按 seq 排列主持人的 bridge 与 follow_up 插话，不会有相邻两次都是 bridge。
   - E2E 后端的 `MAX_TURNS` 由 8 改为 12（与 06e 的整场验收一致）。8 轮内通常只有一次串联，追问几乎不会出现，截图和质量断言都覆盖不到。改为 12 后抢答额度为 2 次，§2 第 8 条的公式不变。真实模型场景仍用 8 轮。
```

完整原文：[docs/prompts/09-e2e.md](prompts/09-e2e.md)。

说明：编排日志记载，E2E 用服务端测试种子 `TEST_DISCUSSION_ID_SEED` 取得确定性，发现并修复洞察立场按随机 UUID 排序、同毫秒洞察按随机 id 决胜两个缺陷；默认套件连续 3 次 10 passed / 1 skipped，真实模型场景运行 1 次通过（阵容 8.3s、首条专家发言 12.9s、全场 45.1s）。

## 【交付】Prompt 10 · README、工作流、Prompt 记录与 PDF

执行者：luna-worker 子代理（配置为 GPT-6 Luna）；对应提交：文档与交付（本文所在提交）。

Prompt 原文摘录：

```text
> 为什么单独做这一步：作业写明“开发文档是重点考察项”。评审者通过 README、规格文档、Prompt 记录和工作流说明来判断工程拆解能力和对 AI 输出的掌控力。所以文档必须真实、可复现，并且与代码一致。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md` 和编排日志 `journal.md`，再读 `docs/` 下全部文档与 `docs/prompts/` 下全部 Prompt，用 `git log --stat` 了解提交演进。
- 所有事实（命令、端口、环境变量、默认值、测试数量、提交 hash、遇到的问题）都必须来自代码、命令输出或编排日志。不确定的就去查证；查不到的不要写。

## 1. `README.md`（根目录，中文）

作业要求 README 必须包含：运行指南、环境变量配置、技术选型说明、主要 API 列表、已完成能力与后续改进方向。按以下顺序组织：

1. 项目名与一句话简介；3–5 张截图（大厅、阵容确认、演播厅直播中、演播厅结束后的共识分歧与总结、手机端）。从 `_review\e2e\` 挑选，复制到 `docs/images/`，用英文文件名；图片总大小不超过 3 MB，超出时用 Edge 重新截图为 JPEG（质量 80）。
2. 已完成能力：对照作业的“功能要求”和“技术要求”逐条列出，每条写清实现方式，以及由哪个测试或 E2E 场景验证。

（中略）

**第二部分 B（09 提交后，resume 第二部分 A 的子代理）**

完成其余内容：README 的待补小节；`docs/TEST-PLAN.md` 与实现对齐（09 写入的 E2E 结果只核对）；PROMPT-LOG 的 06e、09、10 三段；WORKFLOW 的标记；正式 PDF；§6 的全部验证。届时编排者会给出新增的提交与编排日志要点。
```

完整原文：[docs/prompts/10-docs-delivery.md](prompts/10-docs-delivery.md)。

说明：编排日志记载，Prompt 10 拆成两部分：A 与 06e 并行完成不依赖最终代码的文档对齐与 PROMPT-LOG 补段，B 在 09 提交后补齐截图、E2E 小节、TEST-PLAN、三段占位、正式 PDF 与全部验证；因第一部分子代理会话被额度切换，第二部分改派新的 luna-worker 子代理完成 A、B 两步。
