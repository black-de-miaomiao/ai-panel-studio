# 【交付阶段 · Prompt 10】README、开发文档收口、核心 Prompt 记录、工作流说明与 PDF

| 项 | 内容 |
|---|---|
| 范式 | 文档即交付：把 SDD → DDD → TDD → E2E 的全过程整理成评审者可以直接阅读、可以复现的材料 |
| 执行者 | luna-worker 子代理（GPT-6 Luna） |
| 编排者 | Factory Droid 主代理 |
| 输入 | `AGENTS.md`；`docs/` 下全部文档；`docs/prompts/` 下全部 Prompt（只读）；编排日志 `C:\Users\123\Desktop\mianshiti\_review\journal.md`（真实发生的问题与决定）；`git log`；各包 `package.json` 脚本；`server/.env.example`；`server/db/seed.sql`；`C:\Users\123\Desktop\mianshiti\_review\e2e\` 截图 |
| 产出 | 仓库内：`README.md`、`docs/PROMPT-LOG.md`、`docs/WORKFLOW.md`、`docs/images/*`，以及与实现对齐的 `docs/*.md` 修订。仓库外：`C:\Users\123\Desktop\mianshiti\deliverables\` 下的两份 PDF；生成与校验脚本放在 `C:\Users\123\Desktop\mianshiti\_review\tools\` |
| 约束 | 不修改 `docs/prompts/`；不改业务代码（文档与实现不一致时以实现为准修文档；发现实现缺陷只报告不修）；不安装依赖；不读取 `server/.env`；不执行 git 写操作 |

> 为什么单独做这一步：作业写明“开发文档是重点考察项”。评审者通过 README、规格文档、Prompt 记录和工作流说明来判断工程拆解能力和对 AI 输出的掌控力。所以文档必须真实、可复现，并且与代码一致。

## 0. 开始前

- 仓库根目录 `C:\Users\123\Desktop\mianshiti\ai-panel-studio`。先读 `AGENTS.md` 和编排日志 `journal.md`，再读 `docs/` 下全部文档与 `docs/prompts/` 下全部 Prompt，用 `git log --stat` 了解提交演进。
- 所有事实（命令、端口、环境变量、默认值、测试数量、提交 hash、遇到的问题）都必须来自代码、命令输出或编排日志。不确定的就去查证；查不到的不要写。

## 1. `README.md`（根目录，中文）

作业要求 README 必须包含：运行指南、环境变量配置、技术选型说明、主要 API 列表、已完成能力与后续改进方向。按以下顺序组织：

1. 项目名与一句话简介；3–5 张截图（大厅、阵容确认、演播厅直播中、演播厅结束后的共识分歧与总结、手机端）。从 `_review\e2e\` 挑选，复制到 `docs/images/`，用英文文件名；图片总大小不超过 3 MB，超出时用 Edge 重新截图为 JPEG（质量 80）。
2. 已完成能力：对照作业的“功能要求”和“技术要求”逐条列出，每条写清实现方式，以及由哪个测试或 E2E 场景验证。
3. 运行指南：环境要求（Node.js ≥ 22.13、npm）；安装；配置 Key（复制 `server/.env.example` 为 `server/.env` 并填写；不填时自动使用 mock 大模型演示）；初始化数据库（写入 6 条样例）；开发模式启动与访问地址；测试命令（单元与集成、E2E、可选的真实模型 E2E）。每条命令都要实际运行验证（见第 6 节）。
4. 环境变量配置：后端与前端分两张表（变量、默认值、说明），与 `server/.env.example`、`server/src/config.ts`、Vite 配置一致。写明 Key 只在后端读取，浏览器拿不到。
5. 技术选型说明：每项一句“选了什么、为什么”，例如 `node:sqlite` 不需要编译原生模块、SSE 天然适合服务端单向推送并支持 `Last-Event-ID` 补发、zod 契约让前后端共用一份类型、DeepSeek 按任务分质量档与速度档并关闭思考模式。
6. 架构概览：一张 mermaid 流程图（浏览器 → Vite 代理 → Express REST 与 SSE → 讨论引擎 → LLM 网关（DeepSeek / Mock）→ SQLite），与 `docs/ARCHITECTURE.md` 一致。
7. 主要 API 列表：REST 与 SSE 各一张表（方法、路径、说明），链接到 `docs/API.md`。
8. 样例数据：6 条种子讨论（话题、状态、专家人数、阵容概述）。
9. 目录结构（只列到第二层，附职责说明）。
10. 开发文档索引：PRD、ER、API、ARCHITECTURE、UI-DESIGN、TEST-PLAN、RUNTIME-PROMPTS、PROMPT-LOG、WORKFLOW、prompts/，每个一句话。
11. 开发范式与提交演进：表格列出每个提交（hash、类型、所属范式、内容），说明为什么按 docs/schema → ui-components → tests → feat 的顺序提交。用 `git log --reverse --oneline` 的真实结果。最后几个提交（本阶段的文档提交与之后的提交）此时还不存在，表格末尾写“文档与交付（本 README 所在提交）”即可。
12. 安全与隐私：Key 只在后端、`reasoning_content` 一律丢弃、话题注入防护、E2E 泄漏检测。
13. 已知限制与后续改进方向：5–8 条真实可行的方向。

## 2. 开发文档收口（与实现对齐）

- `docs/API.md`：逐个对照 `server/src/routes`、`server/src/app.ts` 与 `shared/` 契约，核对路径、方法、请求与响应字段、错误码、SSE 事件名与载荷、`Last-Event-ID` 补发。不一致处以实现为准修正文档，并在报告中逐条列出（原文 → 新文 → 依据）。
- `docs/ARCHITECTURE.md`、`docs/ER.md`、`docs/PRD.md`、`docs/UI-DESIGN.md`、`docs/TEST-PLAN.md`：只修正与实现不一致的事实（文件路径、配置项、默认值、测试数量等），不改设计意图。
- mermaid 校验：在 `_review\tools\` 写一个脚本，提取 `README.md` 与 `docs/*.md`（不含 `docs/prompts/`）中的全部 mermaid 代码块，用仓库已有的 Playwright 以 `channel: 'msedge'` 打开空白页，从 CDN 加载 mermaid，逐块调用 `mermaid.parse`。报告代码块总数与结果，修好所有语法错误。若 CDN 不可用，在报告里说明，并逐块人工复核。
- 链接校验：在同一目录写脚本，检查 `README.md` 与 `docs/*.md` 中的相对链接和图片路径都指向存在的文件。

## 3. `docs/PROMPT-LOG.md`（核心 Prompt 记录，作业硬性要求）

作业原文：记录引导 AI 开发的最核心原始 Prompt；明确标记每个 Prompt 阶段对应的开发范式，至少包含【SDD 阶段】数据建模与 API 契约生成、【DDD 阶段】前端组件与页面生成、【TDD 阶段】核心逻辑的测试用例编写与业务实现、【E2E 阶段】系统级端到端测试与质量闭环；每段 Prompt 后附 1–2 句说明（当时意图、遇到了什么挑战、如何引导 AI 修正）。

- 开头一段说明工作方式：用户提出需求并做关键决策 → Factory Droid 主代理作为编排者拆解阶段、撰写 Prompt、审查与提交 → luna-worker 子代理执行。全部 Prompt 原文在 `docs/prompts/`，本文收录核心部分。然后放一张阶段总览表：序号、范式标签、Prompt 文件、执行者、对应提交。
- 正文按时间顺序，每个 Prompt 一段，覆盖 `docs/prompts/` 下的全部文件（以目录实际内容为准，包括 01b、03b、05b、06b、06c、06d 等评审回路，以及 08a 文件末尾的“续派 1 / 续派 2”和 06d 末尾的“补充更正”）。每段：
  - 标题格式：`## 【SDD 阶段】Prompt 01 · 产品需求、数据模型与 API 契约`。标签只用【SDD 阶段】【DDD 阶段】【TDD 阶段】【E2E 阶段】四种：脚手架 02 归入【SDD 阶段】（按架构规格落地模块边界），前端接入 08 归入【DDD 阶段】，本 Prompt 10 标【交付】。
  - 元信息一行：执行者、对应提交（hash 与提交说明）。
  - Prompt 原文：从对应文件逐字摘录最核心的部分（目标、关键约束、硬性要求），放在 `text` 代码块里；可以跳过中间部分，但要用“（中略）”标明，不得改写原文措辞。随后附完整原文链接。
  - 说明：1–2 句，写当时的意图、遇到的挑战、如何引导 AI 修正。内容必须来自编排日志或子代理报告中的真实事件，不得虚构。
- 每段摘录控制在 15–40 行，全文便于阅读。

## 4. `docs/WORKFLOW.md`（开发过程思路与工作流说明，1–1.5 页）

作业要求三部分：

1. 开发流程。作业问“如何通过 Claude Code 结合 DeepSeek V4 Pro 进行开发”。如实回答：本项目使用的 AI 编码工具是 Factory Droid（与 Claude Code 同类的 AI 编码代理），主代理作为编排者，luna-worker 子代理执行；DeepSeek V4 Pro 是应用运行时的质量档模型（阵容生成与总结），DeepSeek Flash 是速度档模型（出价、发言、主持人、洞察）；开发中用真实 DeepSeek 冒烟调优运行时 Prompt，并做整场联调。按 SDD → DDD → TDD → E2E 写清每个阶段做什么、编排者怎样审查、怎样分层提交。
2. 2–3 个典型问题及解决路径：从编排日志里选最有代表性的 3 个，每个写“现象 → 原因 → 解决 → 结果”。
3. 对“工程化 AI 开发”的理解：4–6 条，每条结合本项目的具体做法。

篇幅：正文约 1400–2000 个汉字。用 A4 打印时为 1–1.5 页（见第 5 节的页数校验）。不用 mermaid（PDF 中不渲染），最多一张小表格。用第一人称“我”（作业提交人）来写。

## 5. PDF（仓库外，用于邮件附件）

- 在 `_review\tools\md2pdf.py` 中实现：用 Python 的 `markdown` 包（扩展 `tables`、`fenced_code`）转为 HTML，内嵌 CSS（A4，页边距约 16 mm，字体 Microsoft YaHei，正文 10.5pt，行高 1.6，代码块等宽小字、浅底并自动换行，表格加边框），再用本机 Edge 无头打印：`msedge --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf=<输出> <html 文件 URL>`。Edge 路径先用 `Get-Command` 或常见安装路径查找。
- 输出到 `C:\Users\123\Desktop\mianshiti\deliverables\`：`核心Prompt记录.pdf`（来自 PROMPT-LOG.md）、`工作流说明.pdf`（来自 WORKFLOW.md）。
- 用 PyMuPDF（`fitz`）校验：
  - 工作流说明：1 页，或 2 页且第 2 页最后一个文本块的底部不超过页面高度的 55%。不满足时调整正文篇幅，不要靠缩小字号。
  - 两份 PDF 的文本里都不含 `sk-` 形态的字符串。
- 把两份 PDF 的第 1 页渲染为 PNG 放到 `_review\docs\`，供编排者审查排版。

## 6. 验证

1. README 的“运行指南”逐条实际执行。数据库用临时路径（通过 `DATABASE_PATH` 环境变量），后端用 `LLM_PROVIDER=mock` 并换用空闲端口，验证健康检查与讨论列表接口；前端验证能构建。长驻进程验证完按 PID 停掉。
2. 在仓库根目录运行 `npm run typecheck` 与 `npm test`，确认全绿（本阶段不应改代码，只做确认），并把各包的用例数写进 README。
3. mermaid 与链接校验全部通过。
4. 密钥扫描：`rg "sk-[A-Za-z0-9]{12,}"`，排除 node_modules、.git、`server/.env`、dist，结果应为空。
5. 统计 WORKFLOW.md 的汉字数与两份 PDF 的页数。

## 7. 报告

文件清单；README 各节与作业要求的对照；文档修订清单（原文 → 新文 → 依据）；PROMPT-LOG 段落表（序号、范式、Prompt 文件、摘录行数）；WORKFLOW 字数与 PDF 页数；mermaid 与链接校验结果；验证命令与结果；遗留问题。

---

## 派发说明（编排者补充：本 Prompt 分两部分派发给同一个子代理）

### 第一部分（现在执行，与其他子代理并行）

此时 07 续派 2 正在修改 `server/` 与 `docs/RUNTIME-PROMPTS.md`；之后还有 06e（只改 mock）和 09（E2E，会改 `docs/TEST-PLAN.md` 以及少量 web、server 代码）。为了互不干扰，第一部分只做不依赖最终代码的工作：

1. 阅读 §0 列出的输入（`_review\e2e\` 的截图此时还没有）。
2. 按 §3 编写 `docs/PROMPT-LOG.md`，覆盖已经提交的阶段：01、01b、02、03、03b、04、05、05b、06、06b、06c、06d、07（首轮与续派 1，对应 d6aabc4）、08（含续派 1、续派 2）、08a（含续派 1、续派 2）。06e、07 续派 2、09、10 还没有执行或提交：在正文的对应位置各放一个只有标题和“（第二部分补齐）”的占位段，阶段总览表的提交列写“待定”。提交与 Prompt 的对应关系以编排日志的“时间线与提交”表和 `git log` 为准。执行者写“luna-worker 子代理（配置为 GPT-6 Luna）”。
3. 按 §4 编写 `docs/WORKFLOW.md` 初稿。E2E 阶段的结果和最终数字（用例数、提交数等）用“（第二部分补齐）”标出；典型问题从编排日志中选 3 个。
4. 按 §5 编写 `_review\tools\md2pdf.py` 与 PDF 校验。环境：命令是 `python`（3.13，已装 markdown 3.11 与 PyMuPDF 1.28，用 `import pymupdf`），没有 `py`；Edge 在 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。草稿 PDF 输出到 `_review\docs\draft\`（不是 `deliverables\`），并渲染第 1 页 PNG；报告 WORKFLOW 草稿的汉字数与页数。
5. 按 §2 编写 mermaid 校验与链接校验脚本，对当前的 `README.md`（如果存在）与 `docs/*.md` 跑一次并报告结果。第一部分不修改既有文档，发现的问题列进报告，第二部分统一修。

第一部分的约束：只新建 `docs/PROMPT-LOG.md`、`docs/WORKFLOW.md`，以及 `_review\tools\`、`_review\docs\` 下的文件；不改仓库里的任何其他文件；不运行 `npm test`、不启动服务（其他子代理正在改代码，此时的测试结果不代表最终状态）；不读取 `server/.env`；不执行 git 写操作。报告：文件清单；PROMPT-LOG 段落表（序号、范式、Prompt 文件、摘录行数，占位段单独标出）；WORKFLOW 草稿的汉字数与页数；mermaid 与链接校验结果；发现的文档与实现不一致（只列不改）。

### 第二部分（09 提交后，resume 同一子代理）

完成本 Prompt 的其余全部内容：README、§2 文档收口、补齐 PROMPT-LOG 的占位段与 WORKFLOW 的标记、生成正式 PDF、§6 全部验证。届时编排者会给出新增的提交与编排日志要点。

### 第二部分拆分（编排者，07 续派 3 提交后）

07 续派 2、续派 3 已提交（4f40e75、f5ee7fa）；06e 正在执行（只改 `server/src/llm/mock*`），之后是 09。为缩短总工期，第二部分拆成 A、B 两步，A 现在与 06e 并行执行。

第一部分的子代理在续跑后半段因 Standard 额度用完被切换到 Kimi K3，会话配置至今仍是 Kimi K3。按用户“全部子代理使用 luna-worker（GPT-6 Luna）”的决定，第二部分改派一个新的 luna-worker 子代理，A、B 两步都由它完成。

**第二部分 A（现在执行）**

1. §2 文档收口，范围限于 `docs/API.md`、`docs/ARCHITECTURE.md`、`docs/ER.md`、`docs/PRD.md`、`docs/UI-DESIGN.md`：以当前 main（f5ee7fa）的实现为准核对并修正事实。`docs/TEST-PLAN.md` 留给 09 与第二部分 B；`docs/RUNTIME-PROMPTS.md` 已由编排者在 f5ee7fa 中补了 run 4–6 记录，A 不改。对这些文件跑 mermaid 与链接校验并修好。
2. PROMPT-LOG：补齐“07 续派 2”占位段，并新增“07 续派 3”一段（提交分别是 4f40e75、f5ee7fa；摘录取自 07 Prompt 文件末尾对应小节，说明取材自编排日志的对应条目）；06e、09、10 的占位段保留；阶段总览表同步更新。
3. README.md 初稿：先写不依赖 E2E 的小节（§1 的第 1 项文字部分，以及第 4–10、12、13 项）；截图、已完成能力与测试的对照、运行指南里的 E2E 命令、目录结构中的 `e2e/`、提交演进表先留“（第二部分 B 补齐）”。已知限制要包含 RUNTIME-PROMPTS“run 4–6”一节记下的不足：真实模型下共识条目偏少、主持人问法偶有重复、专家论点偶有相近。
4. WORKFLOW：只更新已经确定的事实（07 续派 2、续派 3），E2E 与最终数字仍保留标记。

A 的约束：只改上面列出的文件，以及 `_review\tools\`、`_review\docs\` 下的文件；不改 `server/`、`web/`、`shared/`、`e2e/`、`docs/TEST-PLAN.md`、`docs/RUNTIME-PROMPTS.md`、`docs/prompts/`；不运行 `npm test`，不启动服务；不读取 `server/.env`；不执行 git 写操作。报告：文档修订清单（原文 → 新文 → 依据）；PROMPT-LOG 段落表的变化；README 已写与待补的小节；mermaid 与链接校验结果；发现的实现缺陷（只报告不修）。

**第二部分 B（09 提交后，resume 第二部分 A 的子代理）**

完成其余内容：README 的待补小节；`docs/TEST-PLAN.md` 与实现对齐（09 写入的 E2E 结果只核对）；PROMPT-LOG 的 06e、09、10 三段；WORKFLOW 的标记；正式 PDF；§6 的全部验证。届时编排者会给出新增的提交与编排日志要点。
