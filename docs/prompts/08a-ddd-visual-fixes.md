# 【DDD 阶段 · Prompt 08a】视觉评审修订：超宽屏舞台、专家小窗、对比度、状态文案与样式拆分

| 项 | 内容 |
|---|---|
| 范式 | DDD 评审回路（Review → Fix）：编排者审阅 DDD 截图（1440 / 2560 / 390）后提出修订。只改表现层，不改数据流 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`、`docs/UI-DESIGN.md`、`web/src`（DDD 产出）、旧截图与截图脚本 `C:\Users\123\Desktop\mianshiti\_review\ddd\`（`shot.mjs`） |
| 产出 | `web/src/styles/*.css`、相关组件的表现层修改与组件测试、`docs/UI-DESIGN.md` 同步；新截图放在 `C:\Users\123\Desktop\mianshiti\_review\ddd2\` |
| 约束 | 只改 `web/` 与 `docs/UI-DESIGN.md`；不改 `shared/`、`server/`；不改 `web/src/state`、`web/src/api`、`web/src/mocks` 的数据流与接口（下一阶段接入真实 API 依赖它们）；不安装依赖；不读取 `server/.env`；不执行 git 写操作 |

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

## 3. 验证

1. `npm run typecheck -w @aps/web`、`npm test -w @aps/web`（现有 13 个用例保持通过）、`npm run build -w @aps/web`。
2. 为第 2 节的第 2、4 项补组件测试：小窗在没有 focus 时显示“正在聆听”；字幕条在 ended / paused 时显示对应文案。
3. 截图保存到 `_review\ddd2\`：`studio-demo-1440.png`、`studio-demo-2560.png`、`studio-demo-390.png`（都要有人正在发言）、`studio-ended-1440.png`、`studio-ended-390.png`、`lobby-1440.png`、`lobby-390.png`、`new-lineup-1440.png`；如果 mock 剧本能触发暂停，再加 `studio-paused-1440.png`。三档视口下页面本身都不整体滚动（`document.scrollingElement.scrollHeight <= innerHeight + 1`）。
4. 对比度：列出修改后的“文字色 / 背景色”组合，以及按 WCAG 公式算出的对比度。
5. 结束前停掉 dev server，并确认端口已释放。

## 4. 报告

改动文件清单；样式拆分前后的截图比较结果；每项视觉修订的做法与截图路径；对比度表；测试、类型检查与构建结果；与 `docs/UI-DESIGN.md` 的同步内容；遗留问题。
