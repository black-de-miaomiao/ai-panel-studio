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

## 2. 依赖（取当前最新稳定版、彼此兼容；后续阶段不再新增）

| 位置 | dependencies | devDependencies |
|---|---|---|
| 根 | — | typescript, concurrently, @playwright/test, @types/node |
| shared | zod | typescript, vitest |
| server | express@5, zod, @aps/shared | tsx, vitest, supertest, @types/express, @types/supertest, @types/node, typescript |
| web | react@19, react-dom@19, react-router@7, lucide-react, clsx, @aps/shared | vite, @vitejs/plugin-react, tailwindcss@4, @tailwindcss/vite, vitest, jsdom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, @types/react, @types/react-dom, typescript |

- 工作区内部依赖写 `"@aps/shared": "*"`，由 npm workspaces 链接本地包。
- 不要运行 `npx playwright install`（E2E 阶段再处理浏览器）。

## 3. 具体要求

### 3.1 根目录

- `package.json`：name `ai-panel-studio`，private，`"type": "module"`，`engines.node: ">=22.13"`，workspaces `["shared", "server", "web"]`，scripts：
  - `dev`：`concurrently -k -n server,web -c cyan,magenta "npm run dev -w @aps/server" "npm run dev -w @aps/web"`
  - `typecheck`：`npm run typecheck --workspaces --if-present`
  - `test`：`npm run test --workspaces --if-present`
  - `test:e2e`：`playwright test`
  - `build`：`npm run build -w @aps/web`
  - `db:init`：`npm run db:init -w @aps/server`；`db:reset`：`npm run db:reset -w @aps/server`
- `tsconfig.base.json`：target ES2023、module ESNext、moduleResolution Bundler、strict、esModuleInterop、skipLibCheck、resolveJsonModule、isolatedModules、forceConsistentCasingInFileNames。
- `.gitignore`：node_modules/、dist/、coverage/、.env、.env.*、!.env.example、*.db、*.db-wal、*.db-shm、server/data/、test-results/、playwright-report/、blob-report/、.vite/、*.log、.DS_Store、Thumbs.db。
- `.gitattributes`：`* text=auto eol=lf`，图片等二进制文件标记 binary。
- `.editorconfig`（utf-8、lf、2 空格、末尾换行），`.nvmrc` 内容 `24`。

### 3.2 shared

- `package.json`：name `@aps/shared`，version 0.1.0，private，`"type": "module"`，`main` / `types` / `exports` 都指向 `./src/index.ts`；scripts `typecheck: tsc --noEmit`、`test: vitest run`。
- `src/index.ts`：`export const CONTRACT_VERSION = '0.1.0';`（占位，SDD 第二步补全契约）。`src/index.test.ts`：一个简单测试。

### 3.3 server

- `package.json`：name `@aps/server`，private，`"type": "module"`；scripts：`dev: tsx watch src/index.ts`、`start: tsx src/index.ts`、`typecheck: tsc --noEmit`、`test: vitest run`、`db:init: tsx scripts/db-init.ts`、`db:reset: tsx scripts/db-init.ts --reset`。
- `tsconfig.json` 继承 base，types 含 node，include `src`、`scripts`。
- `vitest.config.ts`：environment node，include `src/**/*.test.ts`，testTimeout 20000。
- `.env.example`：列出全部配置项并配中文注释，`LLM_API_KEY=` 留空：PORT=8787、DATABASE_PATH=./data/panel.db、LLM_PROVIDER=（空=自动）、LLM_API_KEY=、LLM_BASE_URL=https://api.deepseek.com、LLM_MODEL_QUALITY=deepseek-v4-pro、LLM_MODEL_FAST=deepseek-flash、LLM_MAX_CONCURRENCY=6、MAX_TURNS=16、PACING_MS=800、MOCK_LATENCY_MS=400、MOCK_STREAM_DELAY_MS=30。
- `src/config.ts`：
  - `loadDotEnv()`：若 `server/.env` 存在则用 `process.loadEnvFile` 读取。路径用 `import.meta.url` 相对定位，不依赖 cwd；不打印内容；已存在的环境变量不被覆盖（便于测试与 E2E 注入）。
  - `loadConfig(env = process.env): AppConfig`：zod 解析并补默认值；provider 判定：`LLM_PROVIDER` 显式值优先，否则有 `LLM_API_KEY` → `deepseek`，否则 → `mock`。
  - `describeConfig(config)`：返回可安全打印的对象，只含 `hasApiKey: boolean`，不含 Key 原文。
- `src/db/connection.ts`：`openDatabase(path: string): DatabaseSync`（来自 `node:sqlite`）；支持 `:memory:`；文件路径相对 server 包根目录解析并自动创建父目录；执行 `PRAGMA foreign_keys = ON`、`journal_mode = WAL`（内存库跳过）、`busy_timeout = 5000`。
- `src/app.ts`：`createApp(deps: { config: AppConfig; db: DatabaseSync })` 返回 Express 应用；`express.json({ limit: '100kb' })`；`GET /api/health` → `{ ok: true, llm: { provider, qualityModel, fastModel } }`；未匹配路由 → 404 `{ error: { code: 'NOT_FOUND', message: '接口不存在' } }`；统一错误中间件 → 500 `{ error: { code: 'INTERNAL', message: '服务器内部错误' } }`，不泄露堆栈。
- `src/index.ts`：loadDotEnv → loadConfig → openDatabase → createApp → listen；启动日志打印监听地址与 `describeConfig` 结果；SIGINT / SIGTERM 时关闭 HTTP 服务与数据库。
- `scripts/db-init.ts`：占位实现：打开 DATABASE_PATH；若 `server/db/schema.sql` 存在则执行，若 `server/db/seed.sql` 存在则执行；`--reset` 时先删除库文件（含 -wal / -shm）；结束打印 `db init done`。（下一阶段会完善）
- 测试：
  - `src/config.test.ts`：默认值正确；有 Key → deepseek；无 Key → mock；显式 `LLM_PROVIDER=mock` 优先；`describeConfig` 的 JSON 中不含 Key 原文（用假值 `sk-test-not-a-real-key`）。
  - `src/db/connection.test.ts`：`:memory:` 打开后 `select sqlite_version() as v` 有值；`PRAGMA foreign_keys` 为 1。
  - `src/app.test.ts`：supertest `GET /api/health` 返回 200 与正确结构；配置假 Key 时响应文本不含该值；未知路由返回 404 结构。
- 必须确认 `node:sqlite` 能在 Vitest 下加载。如果不行，先尝试 Vitest 配置（例如 `pool: 'forks'`、`server.deps` 相关选项）；仍不行就停下并报告证据，不要擅自更换数据库库。

### 3.4 web

- `package.json`：name `@aps/web`，private，`"type": "module"`；scripts：`dev: vite`、`build: tsc --noEmit && vite build`、`preview: vite preview`、`typecheck: tsc --noEmit`、`test: vitest run`。
- `index.html`：`lang="zh-CN"`，title「AI Panel Studio · AI 圆桌演播厅」，含 viewport meta。
- `vite.config.ts`：plugins `react()` 与 `tailwindcss()`；`server.port = Number(process.env.WEB_PORT ?? 5173)`、`strictPort: true`；`server.proxy['/api'] = { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8787', changeOrigin: true }`，`preview` 同样配置代理；`test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }`。
- `tsconfig.json`：`jsx: react-jsx`，types 含 `vite/client`，include `src` 与 `vite.config.ts`。
- `src/styles/index.css`：`@import "tailwindcss";`；`html, body, #root { height: 100%; }`；`body { margin: 0; overflow: hidden; background: #05070D; color: #E6E8EE; font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; }`。
- `src/main.tsx`：`BrowserRouter`（从 `react-router` 导入）包裹 `App`。
- `src/App.tsx`：占位路由 `/`、`/new`、`/studio/:id`；首页显示品牌名「AI Panel Studio」并请求 `/api/health` 展示 provider。
- `src/test/setup.ts`：`import '@testing-library/jest-dom/vitest';`。`src/App.test.tsx`：mock fetch 后渲染，能看到「AI Panel Studio」。

### 3.5 git

- 在仓库根目录执行 `git init -b main`。不要 add 或 commit。
- 确认 `git check-ignore server/.env` 输出 `server/.env`（已被忽略）。

## 4. 验证（在仓库根目录执行，结果如实记录）

1. `npm install`（registry 为 npmmirror）
2. `npm run typecheck`
3. `npm test`
4. 后台启动后端（用 Execute 的 fireAndForget，命令 `npm run dev -w @aps/server`），用 `Invoke-RestMethod http://localhost:8787/api/health` 检查返回，然后按 PID 停止进程（确认 8787 端口已释放）
5. `npm run build -w @aps/web`
6. `git status --short`：确认 `server/.env` 不在列表中

## 5. 报告

报告：最终目录树（不含 node_modules）、各依赖实际安装的版本、每条验证命令的结果、遇到的问题与处理方式、与本 Prompt 的偏差。
