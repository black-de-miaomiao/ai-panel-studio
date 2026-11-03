# 【TDD 阶段 · Prompt 05b】Red 评审回路：规格更新后同步桩与测试

| 项 | 内容 |
|---|---|
| 范式 | TDD Red 评审回路（Review → Spec Fix → Test Sync）：编排者审查 Red 产出时发现规格里两处会让讨论卡住的漏洞，并按 DeepSeek 文档补上思考模式路由；先改规格（commit 1f0e66f），再让子代理同步测试 |
| 执行者 | 05 阶段的同一个 luna-worker 子代理（续用上下文） |
| 编排者 | Factory Droid 主代理 |

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

## 验证与报告
`npm run typecheck -w @aps/server` 通过；`npm test -w @aps/server`：db、config、app 共 31 个用例通过，新增用例全部失败且原因是 NOT_IMPLEMENTED（或桩抛出的通用 Error 与预期错误类型不符）。最后一条消息是完整报告：改动文件、新增用例数、测试结果统计。报告之后不要再发送其他简短消息。
