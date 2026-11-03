# 【SDD 阶段 · Prompt 03b】种子数据评审修订：回放样例去机械化、洞察证据对齐、立场标签

| 项 | 内容 |
|---|---|
| 背景 | 编排者审查 Wave2 产出：schema、契约、repository 与测试全部合格；种子“往期回放”样例在内容层面存在 4 类问题 |
| 执行者 | 原 Wave2 子代理（续接上下文） |
| 范围 | `server/db/seed.sql`、`server/src/db/seed.test.ts`（第 6 项 `LOBBY_GROUPS` 改由 Wave3 DDD 子代理执行，本次不要改 `shared/`） |

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

### 2. 洞察立场与原话不符（必须修）

现状例子：共识“办公空间可由固定工位转成有目标的团队协作节点”列出了梁映南的立场，但梁映南从未表达过；分歧中程砚秋的“远程优先可减少无效通勤”也无原话支撑。

要求：

- 至少 3 条共识、3 条分歧，其中 1 条分歧 `resolved`。
- 每条洞察的每个立场，其专家都必须是该洞察 `evidence_seqs` 中至少一条发言的作者，且那条发言确实支持该立场。
- 共识必须是 Transcript 中明确表达过的认同。
- 分歧的 content 写成争议问题（“……能否……”“……还是……”），position 是各方的简短立场。
- resolved 的分歧要有较晚的证据，体现双方明确靠拢。

### 3. 总结缺少主持人口吻（应修）

summary（等于 closing 的 content）写 3–4 段，用 `\n\n` 分隔：

1. 回顾议题与讨论走向。
2. 主要共识，提及专家姓名。
3. 关键分歧，提及姓名与各自理由。
4. 开放问题，并感谢嘉宾和观众。

### 4. 事件日志要与引擎语义一致（应修）

events 顺序（seq 从 1 连续，`at` 单调递增，payload 都能通过 `StreamEventSchema`）：

1. `discussion.status(live, turnCount 0)`
2. opening 的 `utterance.completed`
3. 每条正文发言：`utterance.completed`，紧接 `discussion.status(live, turnCount n)`
4. 期间至少 4 次 `insights.updated`。payload 为当时完整的洞察列表：逐步增加或变化，id 稳定；最后一次与 insights 表的最终状态一致。
5. `discussion.status(summarizing)`
6. closing 的 `utterance.completed`
7. `summary.completed`
8. `discussion.status(ended, turnCount 最终值)`

此外：每位参与者的 `speak_count` 等于其实际发言条数（主持人含 opening、插话与 closing）；utterances 的 `created_at` 单调递增。

### 5. 立场标签写成了领域名词（应修，6 场都检查）

现状：如“消费者 / 供应链 / 工程 / 竞争”“就业”“安全”“重构”“观察”“转型”，这些是视角，不是立场。

要求：

- 专家的 `stance_tag` 是对话题问题的立场短语，最多 6 字，例如：支持、反对、有条件支持、谨慎乐观、审慎、警惕、中立、质疑。
- 每场至少 3 种不同标签，并且同时包含偏支持和偏反对的立场。
- 主持人的标签保持“引导”。
- stance 句子与标签方向一致。

### 6. `LOBBY_GROUPS` 改为有稳定 key 的有序数组（契约小改，由 Wave3 DDD 子代理执行）

```ts
export const LOBBY_GROUPS = [
  { key: 'live', label: '直播中', statuses: ['live', 'summarizing', 'paused'] },
  { key: 'upcoming', label: '待开播', statuses: ['lineup_ready', 'draft', 'failed'] },
  { key: 'replay', label: '往期回放', statuses: ['ended'] }
] as const;
export type LobbyGroupKey = (typeof LOBBY_GROUPS)[number]['key'];
```

同步更新 shared 的测试。为了让三个子代理并行，这一项由 DDD 子代理在开始编码前完成；种子修订不要改 `shared/`。

## 测试补充（`server/src/db/seed.test.ts`）

- 专家发言序列不是以专家人数为周期的循环，且各专家发言次数不全相同。
- 主持人 follow_up / bridge / invite 都有 reply_to，且下一条发言人等于 reply_to。
- rebut / supplement / interrupt 都有 reply_to；interrupt 的 reply_to 等于上一位发言人。
- 每条洞察的每个立场专家，都至少是一条 evidence 发言的作者。
- `speak_count` 与实际发言条数一致。
- `discussion.status` 事件的 turnCount 单调不减，最后一条为 ended 且 turnCount = turn_count。
- 事件 `at` 单调递增；最后一次 insights.updated 的 payload 与最终洞察一致（id 与 content）。
- 每场阵容专家至少 3 种不同的 stance_tag。

## 验证

`npm run typecheck`；`npm test -w @aps/shared`；`npm test -w @aps/server`；用临时 DATABASE_PATH 执行 `npm run db:reset` 并报告各表行数。最后以可读形式贴出新的回放 Transcript（`#seq 姓名 <act→回应对象> 内容`）和洞察列表（类型 / 状态 / 内容 / 证据 / 各方立场），供编排者审阅。
