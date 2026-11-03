# AGENTS.md · AI Panel Studio 开发约定

> 本文件写给参与开发的 AI 编码代理（编排者与子代理）。每个阶段开始前必须先读完。

## 项目一句话

「AI Panel Studio」是一个本地运行的 AI 圆桌讨论 Web 应用：输入话题 → 大模型生成主持人与专家阵容 → 用户确认 → 在演播厅里实时观看由 AI 驱动的圆桌讨论（举手/抢答/补充/反驳、实时共识与分歧、主持人总结）。

仓库根目录：`C:\Users\123\Desktop\mianshiti\ai-panel-studio`

## 单一事实来源（冲突时按此优先级）

1. `docs/PRD.md`、`docs/ER.md`、`docs/API.md`、`docs/ARCHITECTURE.md`（SDD 规格）
2. `shared/src/`（契约的 TypeScript + zod 实现，前后端唯一类型来源）
3. `docs/UI-DESIGN.md`（前端视觉与交互规范）
4. `docs/TEST-PLAN.md`（测试计划）

不要发明规格里没有的字段、接口、事件或状态。确实需要变更时，先按规格实现，并在报告里写明建议的变更与理由。

## 目录职责

| 目录 | 包名 | 职责 |
|---|---|---|
| `shared/` | `@aps/shared` | 领域类型、zod 契约、SSE 事件、常量（调色板、上限、中文标签） |
| `server/` | `@aps/server` | Express 5 + node:sqlite + SSE + LLM 网关 + 讨论引擎 |
| `web/` | `@aps/web` | React 19 + Vite + Tailwind CSS v4 前端 |
| `e2e/` | — | Playwright 端到端测试 |
| `docs/` | — | 规格与过程文档（Markdown + mermaid） |
| `docs/prompts/` | — | 各阶段原始 Prompt 记录，**只读，不要修改** |

## 技术约定

- Node.js ≥ 22.13（本机 v24），npm workspaces；只用 npm，不要生成 pnpm/yarn 锁文件。
- TypeScript strict + ESM；避免 `any`，确需时注释原因。
- 数据库只用 SQLite（`node:sqlite` 的 `DatabaseSync`）；表结构只在 `server/db/schema.sql` 定义。
- API JSON 用 camelCase，数据库列用 snake_case，转换只在 repository/mapper 层做。
- 所有 UI 文案为简体中文。
- 实时推送统一走 SSE：`GET /api/discussions/:id/stream`。
- 代码注释只解释“为什么”，不写流水账。

## 安全红线

- `server/.env` 存放真实 API Key：**禁止读取、打印、复制、修改、删除或提交**。只能说“密钥在 server/.env”。
- 任何代码、测试、文档、日志、报告里都不能出现真实密钥（形如 `sk-` 加一串字符）。测试需要时用假值 `sk-test-not-a-real-key`。
- API Key 只在后端从环境变量读取；前端代码与任何 API 响应都不能包含它。
- 模型返回的 `reasoning_content`（隐藏思维链）不得转发、存储、记录或展示。

## 常用命令（Windows PowerShell 5.1：用 `;` 连接，不支持 `&&` / `||`）

| 用途 | 命令（在仓库根目录） |
|---|---|
| 安装依赖 | `npm install` |
| 类型检查 | `npm run typecheck`（单个包：`npm run typecheck -w @aps/server`） |
| 单元/集成测试 | `npm test`（单个包：`npm test -w @aps/web`） |
| 本地开发 | `npm run dev`（server :8787，web :5173，web 通过 Vite 代理 `/api`） |
| 初始化数据库 | `npm run db:init`；重建：`npm run db:reset` |
| E2E | `npm run test:e2e` |

启动的 dev server 等长驻进程，验证完必须按 PID 停掉。

## Git

- 只有编排者（主代理）执行 `git add/commit/push`。子代理不要提交、推送或修改 git 配置。
- 仓库统一 LF 换行（见 `.gitattributes`）。

## 依赖

- 依赖在脚手架阶段一次装齐。之后的阶段不要擅自 `npm install` 新包；确有必要时停下来在报告里说明。并行阶段同时安装依赖会破坏 lockfile。

## 交付报告

结束时报告：完成了什么、改动了哪些文件、执行了哪些验证命令及结果（失败要如实写）、与规格的偏差、遗留问题。
