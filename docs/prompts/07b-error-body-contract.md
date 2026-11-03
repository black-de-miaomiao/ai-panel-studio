# 【TDD 阶段 · Prompt 07b】错误响应契约：`details` 始终为数组（评审回路）

| 项 | 内容 |
|---|---|
| 范式 | TDD 评审回路：文档对齐时发现服务端错误响应与共享契约不一致；先用共享 schema 写失败的契约测试，再统一服务端的错误出口 |
| 执行者 | 新的 luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |

## 背景

Prompt 10 第二部分 A 在对齐 API.md 与实现时发现：`shared/src/api.ts` 的 `ApiErrorBodySchema` 要求 `error.details` 是数组，且对象为 strict；API.md §1 的错误格式示例也一直带 `"details": []`。但服务端有三处错误出口，在没有附加信息时省略了 `details`：

- `server/src/app.ts`：errorHandler（zod 校验失败、JSON 解析失败、500 INTERNAL）和末尾的 404「接口不存在」；
- `server/src/routes/discussions.ts` 的 `sendError`：只有传入 details 时才写这个字段，所有 400、404、409、500 路径都没传；
- `server/src/routes/stream.ts` 的 `sendError`：从不写 `details`（SSE 建流前的 404 和 400「事件游标无效」）。

前端 `web/src/api/httpApi.ts` 的 `readApiError` 用 `ApiErrorBodySchema` 严格解析。解析失败时，5xx 变成 NETWORK「无法连接服务器，请确认后端已启动」，其他状态变成 INTERNAL「服务返回了无法识别的数据」。结果是服务端给出的中文 message 全部丢失。例如用户在换一批进行中点击开播，服务端返回 409「阵容正在更新，暂时无法开播」，页面却显示“服务返回了无法识别的数据”。

`server/src/app.test.ts` 的「returns the documented not-found response for unknown routes」用 `toEqual` 断言了不带 `details` 的响应体，与规格不符，是 Red 阶段遗留的偏差。

## 决定（规格已由编排者先行修订）

以契约为准修服务端，`shared/` 和 `web/` 不改：所有错误响应都带 `details`，没有附加信息时为 `[]`。已修订的规格：API.md §1「通用错误格式」（删除了“待处理的不一致”说明），TEST-PLAN §3 的 REST 一行。先读这两处再动手。本次不改 `docs/` 下的任何文件，发现规格仍有矛盾时在报告中指出。

## 要求

1. 新建 `server/src/routes/errors.ts`，导出唯一的错误出口，例如 `sendApiError(response, status, code, message, details = [])`。`code` 使用 `@aps/shared` 的 `ApiErrorCode` 类型，响应体用 `ApiErrorBody` 类型标注，让类型检查保证字段齐全。
2. `app.ts` 的 errorHandler 与 404、`discussions.ts`、`stream.ts` 全部改用它，删掉两个本地 `sendError`。状态码、code、message 与现有行为完全一致；现有 502 响应中带 `discussionId` 的 details 保持不变。
3. 不改 `shared/`、`web/`、`server/src/llm/`、`server/src/engine/` 与 `docs/`。

## 测试（先红后绿）

- `server/src/routes/api.test.ts` 新增「各类错误响应均符合共享错误契约且 details 始终为数组」。逐个触发下列错误，对每个响应体断言 `ApiErrorBodySchema.safeParse(body).success` 为 true，状态码和 code 符合 API.md；除 502 外，`details` 都等于 `[]`。
  - 400：非法 JSON 请求体、空话题、非法状态筛选；
  - 404：未知接口；讨论不存在（快照接口和一个控制接口各一次）；
  - 409：对 `lineup_ready` 讨论调用 pause；
  - 502：阵容生成失败，`details[0].discussionId` 仍然存在；
  - SSE 建流前：讨论不存在返回 404，`Last-Event-ID` 无效返回 400（只断言 JSON 错误响应，不建立事件流）；
  - 500：让一次请求抛出未预期的错误（例如为这个用例单独建一个应用，关闭它的内存数据库后请求列表；或注入会抛错的依赖），断言 code 为 `INTERNAL`、message 为「服务器内部错误」，响应体不含堆栈。
  修改实现前先运行这个用例，确认它因为缺少 `details` 而失败，并在报告里贴出失败摘要。
- `server/src/app.test.ts` 的「returns the documented not-found response for unknown routes」改为期望带 `details: []` 的响应体。报告写明：原断言 → 新断言 → 依据（API.md §1、`ApiErrorBodySchema`）。
- 其余已有用例保持通过，不放宽任何断言。

## 验证

- `npm run typecheck -w @aps/server`
- `npm test -w @aps/server -- src/routes src/app.test.ts` 全绿。
- 另一个子代理正在修改 `server/src/llm/mock*`。如果类型检查或用例只在这些文件中失败，或者因为 mock 输出变化而失败，不要修改那些文件；稍后重跑一次，仍然失败就在报告中写明失败位置。全量回归由编排者在两边都完成后执行。

## 约束

只改 `server/src/app.ts`、`server/src/app.test.ts`、`server/src/routes/` 下的文件（含新建的 `errors.ts`）。不提交 git，不安装依赖，不读取 `server/.env`，不调用真实模型，不启动长驻进程。

## 报告

- 改动文件清单；
- 先红时的失败摘要，以及最终的通过用例数；
- 断言变更：原断言 → 新断言 → 依据；
- `rg -n "error:\s*\{" server/src --glob '!*.test.ts'` 的输出，说明除 `errors.ts` 外不再有手写的错误响应体；
- 与规格的偏差和遗留问题。
