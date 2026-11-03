# 【DDD 阶段 · Prompt 08】前端接入真实 REST 与 SSE，全栈联调

| 项 | 内容 |
|---|---|
| 范式 | DDD 收尾 + 集成：把 DDD 阶段的 mock 数据源替换为真实 REST 与 SSE。组件不改或少改，状态流转仍由同一个 reducer 驱动 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`、`docs/API.md`（全部）、`docs/UI-DESIGN.md`、`docs/PRD.md`（F1–F8 验收标准）、`web/src`（DDD 产出）、`shared/src` |
| 产出 | `web/src/api/httpApi.ts`、`web/src/state/sseEventSource.ts`、页面接线与测试；联调截图放在仓库外 `C:\Users\123\Desktop\mianshiti\_review\web\` |
| 约束 | 只改 `web/`；不改 `shared/`、`server/`（发现后端问题写进报告，不要自己修）；不安装依赖；不读取 `server/.env` |

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

### 1.4 代理与安全

- 验证 Vite `/api` 代理在后端监听 `127.0.0.1` 时能正常工作。如果默认目标 `http://localhost:8787` 在本机解析失败，把默认值改为 `http://127.0.0.1:8787`，并同步修改 `docs/ARCHITECTURE.md` §9.3 和 `docs/API.md` §1 中对应的那一处描述。
- `npm run build -w @aps/web` 之后，检查 `web/dist`：不得出现 `sk-` 开头的密钥样式字符串，也不得出现 `api.deepseek.com`（前端不能直连模型）。

### 1.5 视觉

视觉评审修订已在 Prompt 08a 完成（样式已拆分到 `web/src/styles/` 下的多个文件）。本阶段不做样式重构。接入真实数据后如果出现视觉问题（例如真实模型生成的长文本溢出、长姓名或长 Title 截断），做最小修复，并在截图中说明。

已知问题（编排者审阅 08a 截图时发现）：1920×1080 下 `/studio/demo` 结束态的“DEMO REPLAY”角标遮挡了右下角的“返回大厅”按钮。改为不遮挡任何可交互元素（例如移到不与操作区重叠的位置），并补截 `demo-ended-1920.png` 验证。

## 2. 测试（`npm test -w @aps/web`）

- `httpApi.test.ts`（mock fetch）：成功解析；错误体转 ApiError（中文 message 与 details 保留）；网络失败；响应结构非法。
- `sseEventSource.test.ts`（注入 FakeEventSource）：合法事件透传；非法 JSON 与非法 schema 被丢弃；seq 取自 lastEventId；状态流转；取消订阅时关闭；CLOSED 后带最新 seq 重连。
- `useDiscussion` 集成：快照 + 重放的重复事件 → Transcript 无重复。
- 页面测试（注入假的 DiscussionApi）：大厅分组与空状态；新建页校验与流程；演播厅控制按钮调用正确的接口。

## 3. 全栈联调

1. 用 fireAndForget 后台启动后端（工作目录 server/，同一条命令里设置进程环境变量）：`LLM_PROVIDER=mock`、`DATABASE_PATH` 指向仓库外的临时文件、`MAX_TURNS=10`、`PACING_MS=600`、`MOCK_LATENCY_MS=300`、`MOCK_STREAM_DELAY_MS=30`，然后 `npx tsx src/index.ts`。再后台启动 `npm run dev -w @aps/web`。
2. 在 `C:\Users\123\Desktop\mianshiti\_review\web\flow.mjs` 写 Playwright 脚本（Edge：`channel: 'msedge'`），完整走一遍：大厅（种子列表）→ /new → 创建 → 阵容确认 → 开播 → 观看至结束 → 导出 Markdown（监听 download 事件并检查文件内容）。
   - 截图：`mock-live-1440.png`（有人发言中且已有共识或分歧）、`mock-live-2560.png`、`mock-live-390.png`、`mock-ended-1440.png`、`lobby-1440.png`、`lobby-390.png`、`new-lineup-1440.png`。
   - 断言：三档视口页面不整体滚动；Transcript 中没有“举手 / 抢答”之类的内部事件文字；总结区没有 `{`、`"type"` 这类 JSON 痕迹；浏览器控制台没有报错。
3. 真实 DeepSeek：重启后端，不设置 `LLM_PROVIDER`（使用 `server/.env` 的 Key），`MAX_TURNS=10`，临时数据库。同一脚本走一遍，截图 `deepseek-lineup-1440.png`、`deepseek-live-1440.png`、`deepseek-ended-1440.png`，并记录阵容生成耗时、首条专家发言出现时间和总耗时。只跑 1 次。
4. 结束前按 PID 停掉全部进程，并确认 8787 与 5173 端口已释放。

## 4. 报告

改动文件清单；测试、类型检查与构建结果；dist 安全检查结果；联调截图路径与各项断言结果；DeepSeek 联调耗时；发现的后端或契约问题（附复现步骤）；遗留问题。

---

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
