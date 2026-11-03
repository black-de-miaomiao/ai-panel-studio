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

## 续派 2（07:42，编排者审阅 1920 截图后，resume 同一子代理）

编排者已审阅 1920 截图：关注点语义、1680 换行修复都正确。还有两处布局问题需要修：

1. 结束后桌面端看不到共识与分歧的内容：1440 与 ≥1600 布局在 summarizing / ended 时，用 SummaryPanel 替换了 InsightsPanel，只剩“共识 3 条 · 分歧 1 条”的计数。打开一场“往期回放”时，桌面端无法查看具体的共识与分歧条目（窄屏有 Tab，没有这个问题）。PRD 要求回放完整展示 Transcript、共识与分歧与总结，E2E 也会检查这一点。
   - 修改：在这个面板位置提供两个切换项“主持人总结 / 共识与分歧”（复用现有 Tabs 组件，带计数，键盘可操作，并有正确的 aria 属性）。summarizing 与 ended 时默认显示“主持人总结”；live 与 paused 时保持现状，只显示洞察。底部的“共识 N 条 / 分歧 N 条”计数可以点击，切换到“共识与分歧”。导出与返回大厅按钮保持可见。
   - 补组件或页面测试：ended 时默认显示总结；切换后能看到洞察条目；live 时不显示切换项。
2. ≥1600 布局中，洞察列只有 380px，却把“正在形成的共识”和“仍待讨论的分歧”左右并排，每列约 180px，文字挤压。改为在 380px 列中上下堆叠：共识在上，分歧在下，整列独立纵向滚动。1440 的左下洞察面板宽度足够，保持左右并排。

同步 docs/UI-DESIGN.md（结束态面板切换、超宽屏洞察堆叠）。重新运行 `npm run typecheck -w @aps/web`、`npm test -w @aps/web`、`npm run build -w @aps/web`。重拍 `studio-demo-1920.png`、`studio-ended-1920.png`、`studio-ended-1440.png`、`studio-demo-2560.png`，并新增 `studio-ended-insights-1920.png`、`studio-ended-insights-1440.png`（切换到共识与分歧后的画面）。检查页面不整体滚动。约束与之前相同；另一个子代理仍在 server/ 下工作。最后一条消息是完整报告（改动文件、测试数量、截图路径），报告后不要再发其他消息。
