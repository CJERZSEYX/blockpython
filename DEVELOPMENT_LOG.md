# 开发迭代日志

> 记录每次迭代的具体变更、新增功能、修复问题和待办事项。

---

## 迭代 0：项目脚手架搭建（2026-05-13）

**目标**：建立可运行的前后端项目骨架，配置技术栈，创建数据库表，插入测试数据。

### 新增

- 前端：React 18 + Vite + TypeScript + Ant Design + Zustand
- 前端路由：`/` 登录 → `/tasks` 任务选择 → `/teach/:taskId` 教学页
- 前端组件：三栏布局（TeachingLayout）、BlocklyEditor、TaskPanel、ChatWindow、StageButtons
- 前端服务层：api / authService / taskService / chatService / trackService
- 后端：Node.js + Express + TypeScript + MySQL2 + Python沙箱
- 后端 API：auth/login、task/list、task/detail、task/progress、task/start、task/updateStage、chat/send、track/action、track/batch、submit/run
- 数据库：MySQL `icap_platform`，4 张表（users/tasks/user_progress/user_actions）
- 3 个测试任务：判断成绩 / 循环重复 / 输入与变量
- Docker Compose 部署配置

### 决策

- 技术栈：React + Ant Design + Blockly + CodeMirror / Node.js + MySQL + DeepSeek
- 阶段简化：A 阶段去掉 A1/A2，改为单一码→块；C 阶段改为块→码
- 术语变更："支架" → "差异化支持"（P展示式 / A教练式 / C引导式 / I对等式）
- 积木引擎：Google Blockly（不用 scratch-gui 本体）
- 数据埋点：前端事件监听 → 批量发送 → MySQL user_actions 表

---

## 迭代 1：P 阶段交互实现（2026-05-13）

**目标**：P 阶段不再是一句空白话，学生点击任务分解后能看到子任务、积木卡片、Python 代码映射。

### 新增

- Zustand store 新增：taskContent、selectedSubtask、selectedBlock、highlightedBlockId
- TeachingPage 进入任务时自动 fetch 后端 task detail API，获取 content_json
- TaskPanel 重写：P 阶段渲染子任务折叠面板 → 展开后显示积木卡片 → 点击积木卡片展示 Python 代码 + 颜色标签 + 功能解释
- TeachingLayout 新增 taskContent 属性传递

### 待办（用户反馈）

- [ ] 进入任务时 LLM 应自动描述任务，让学生知道要做什么
- [ ] P 阶段 LLM 应在对话窗解释各子任务
- [ ] 积木展示从文字卡片改为 Blockly 积木 UI
- [ ] Blockly 工具箱需自定义（目前是 Blockly 默认英文积木，学生不知从哪拖积木）

---

## 迭代 2：LLM 自动交互 + 自定义积木工具箱（2026-05-13）

**目标**：学生进入任务时 LLM 主动介绍任务；P 阶段 LLM 解释子任务；Blockly 工具箱中文化 + 颜色匹配。

### 新增

- Zustand store 新增 `pendingSystemMessage`：系统消息队列，ChatWindow 自动消费并发给 LLM
- TeachingPage：加载任务后自动触发 LLM 介绍任务目标
- StageButtons：点击当前 P 阶段按钮触发 LLM 解释所有子任务
- ChatWindow 重构：抽取 `callLLM` 复用函数；新增 `pendingSystemMessage` 监听自动发送
- `customBlocks.ts`：13 个自定义积木定义（中文化 + 四色映射：蓝=控制 / 橙=数据 / 绿=输入输出 / 紫=文本）
- Blockly 工具箱：4 个分类（控制/数据/输入输出/文本），A/C 阶段可交互时自动显示
- `DEVELOPMENT_LOG.md`：创建开发迭代日志，后续持续维护

### 学生交互流程验证点

1. 登录 → 选任务 → 进入教学页
2. 右栏 LLM 自动介绍任务内容
3. 点击[任务分解] → 中栏显示 3 个子任务面板；右栏 LLM 依次解释各子任务
4. 点开子任务 → 展开积木卡片（色块标记 + 名称）
5. 点击积木卡片 → 展开 Python 代码 + 颜色标签 + 功能解释
6. 点击[开始练习] → 左栏积木工具箱出现，学生可拖拽积木

### 待办

- [ ] 积木卡片改为 Blockly 积木 UI（目前是文字卡片）
- [ ] A 阶段积木提交评判对接后端
- [ ] C 阶段代码运行对接 Python 沙箱
- [ ] I 阶段实现双向 LLM 互动

---

## 迭代 3：A 阶段提交评判闭环 + C 阶段代码运行（2026-05-13）

**目标**：A 阶段不再是空壳——学生拖积木、提交、系统评判、LLM 提示，形成完整闭环。同时 C 阶段代码运行打通。

### 新增

- **后端 submit.ts 重写**：新增 `extractBlockTypes()` 从 Blockly XML 中正则提取所有积木类型；`compareBlocks()` 比对预期积木集合与学生提交集合，返回 missing/extra/passed
- **前端 submitService**：新增 `submitBlocks()` 和 `runCode()` 两个 API 封装
- **BlocklyEditor forwardRef**：暴露 `getXml()` 和 `clearWorkspace()` 给父组件调用
- **TeachingLayout**：创建 `blocklyRef`，传递给 BlocklyEditor 和 TaskPanel
- **AStagePanel**：提交按钮 → 从 Blockly 提取 XML → 调用后端评判 → 显示 Alert（缺失/多余积木）→ 失败时自动触发 LLM 提示
- **CStagePanel**：代码编辑框 → 运行按钮 → Python 沙箱执行 → 显示 stdout/stderr → 失败时触发 LLM 提示
- **TaskPanel 重构**：拆分为 BlockCard / SubtaskPanel / AStagePanel / CStagePanel 独立子组件

### 交互流程验证

1. P → A：点击[开始练习] → 左栏工具箱出现，中栏显示 Python 代码
2. 学生在左栏拖积木拼搭
3. 点击[提交积木] → 系统判断缺失/多余积木 → 右栏 LLM 给提示
4. 通过后 → 点击[进阶挑战] → C 阶段：积木展示 + CodeMirror + 骨架
5. 写代码 → 点击[运行代码] → Python 沙箱执行 → 正确则通过

### 待办

- [ ] A 阶段增加跳过按钮功能（连续 3 次错误可跳过）
- [ ] C 阶段积木示意图渲染（目前只是文字描述）
- [ ] I 阶段双向对话逻辑细化
- [ ] 积木 UI 美化

---

## 迭代 4：方案 B — LLM 积木自动推断（2026-05-13）

**目标**：不再手写 expected_blocks，换任务零手工。LLM 读 Python 代码自动输出积木需求，A 阶段评判自动比对。

### 新增

- **`blockDefinitions.ts`**：14 种积木的完整定义（字段 vs 输入槽严格区分），作为 LLM Prompt 的知识库
- **`blockInference.ts`**：LLM 翻译服务——Python 代码 → DeepSeek → 积木需求 JSON（含类型+数量+字段值）
- **正则兜底**：math_number 数量由代码中 `\b\d+\b` 正则统计修正（LLM 偶尔数错）
- **`autoInfer.ts`**：后端启动时自动扫描所有任务的 Python 代码，有代码+未推断的自动调 LLM 并缓存到 MySQL `content_json.inferred_blocks`
- **API `POST /api/task/infer/:id`**：手动触发推断
- **提交接口改造**：`POST /api/submit/run` 收到 `task_id` 时自动查 `inferred_blocks` 比对，前端不再传 `expected_blocks`
- **`blockNames.ts`**：积木 ID → 中文名 + 颜色类别映射，LLM 提示用学生能懂的语言

### 推断结果验证

| 任务 | Python 代码 | LLM 推断的积木 |
|------|-----------|---------------|
| 1 判断成绩 | score=85; if>=60: print("及格") else print("不及格") | variables_set:1 + math_number:2(85,60) + controls_if:1 + logic_compare:1(GTE) + text_print:2 + text:2(及格,不及格) ✓ |
| 2 循环 | for i in range(5): print("-") | controls_repeat_ext:1 + math_number:1(5) + text_print:1 + text:1(-) ✓ |
| 3 输入 | name=input("请输入"); print("你好，"+name) | variables_set:1(name) + sensing_ask:1 + text:2(提示,"你好，") + text_join:1 + text_print:1 ✓ |

### 架构收益

- A 阶段：前端只需传 `task_id`，后端自动查缓存比对——零手工维护
- C 阶段（预留）：同一套推断结果可渲染只读积木，只需加 `Blockly Xml` 输出格式
- 换任务只需改数据库里的 Python 代码，LLM 自动重新推断

### 待办

- [ ] C 阶段积木示意图用推断结果渲染
- [ ] I 阶段双向对话
- [ ] 积木 UI 美化

---

## 迭代 5：A 阶段评判系统调优（2026-05-13）

**目标**：解决"积木正确搭建却被判错"的问题，完善字段值提取和比较逻辑。

### 修复

- **字段提取正则 Bug**：原正则 `<field name="X">value</field>` 无法处理 Blockly 的 `id` 属性 `<field name="VAR" id="...">score</field>`。在 `name="([^"]+)"` 后加 `[^>]*` 跳过额外属性
- **值比较逻辑**：从单纯"类型有无"升级为"类型+数量+字段值"三层比对。字段值采用集合匹配（顺序无关），每个积木的字段值与预期值逐个匹配后剔除，剩余未匹配的即为缺失
- **连接检测**：统计 `<next>` 标签数 + 顶层积木数，若散落在工作区则判不通过
- **编码问题排查**：发现命令行测试工具的 `Invoke-RestMethod` 损坏中文 XML，改用原生 UTF-8 HTTP 请求验证通过

### 评判规则（最终版）

```
学生提交 Blockly XML
  ├── ① 类型+数量：每种积木够不够？(如 math_number 需 2 个，只有 1 个则缺)
  ├── ② 字段值：每个积木的值对不对？(如 NUM=85 vs 100, OP=GTE vs GT, TEXT="及格" vs "OK")
  └── ③ 连接检测：积木是否首尾相连形成链？
①②③ 全过 → ✅，任一不过 → ❌并列出具体错误项
```

### 验证

三个任务均通过完整正确积木的提交测试，且故意错误（值错/数量错/不连接）均被正确检出。

---

## 迭代 6：积木扩充 + LLM 提示中文化（2026-05-13）

**目标**：增加 3 个新积木，修复 LLM 提示时仍输出英文代号的问题。

### 新增积木

| 积木 | 类别 | 对应 Python |
|------|------|------------|
| `% 取余` | 橙色-数据 | `5 % 2` |
| 字符串长度 | 紫色-文本 | `len("hello")` |
| 随机整数 | 橙色-数据 | `random.randint(1,10)` |

### 同步更新

- `customBlocks.ts`：Blockly UI 定义 + 工具箱分类
- `blockNames.ts`：中文名映射
- `blockDefinitions.ts`：LLM 知识库（用于推断时准确识别）

### LLM 提示中文化

之前在 AStagePanel 发送给 LLM 的错误提示中缺少积木名映射，导致 LLM 偶尔仍使用 `text_print` 等代号。修复方式：**每条 LLM 提示消息附带完整积木中文名对照表**（`math_number=数字(橙色-数据)，text_print=输出(绿色-输入输出)...`），确保 LLM 输出时用学生能懂的语言。

### 当前系统状态

| 模块 | 完成度 |
|------|--------|
| 项目骨架 + 前后端通信 | ✅ 100% |
| 数据库 + 3 个测试任务 | ✅ 100% |
| 登录 → 任务选择 → 教学页 | ✅ 100% |
| P 阶段（子任务/积木卡片/LLM 讲解） | ✅ 90% |
| A 阶段（码→块，LLM 推断+评判+反馈） | ✅ 95% |
| Blockly 工具箱（17 个中文化积木） | ✅ 85% |
| C 阶段（块→码，代码运行） | ⚠️ 壳在逻辑缺 |
| I 阶段（双向互动） | ⚠️ 壳在逻辑缺 |
| 数据埋点框架 | ⚠️ 30% |

---

## 迭代 7：C 阶段核心实现（2026-05-14）

**目标**：C 阶段从空壳变为完整教学闭环——左栏 LLM 拼接积木 + 中栏代码沙箱 + LLM 引导不给代码。

### 新增

- **`inferConnectedXml()`**：调 LLM 从 Python 代码生成完整拼接的 Blockly XML
- **C 阶段 API**：`GET /api/task/:id/cstage`，调 LLM 生成+缓存积木 XML
- **C 积木预加载**：进入任务时后台静默加载，切换即显
- **A/C 工作区独立**：A→C 自动保存/加载；C→A 恢复 A 积木
- **工具箱精确控制**：Blockly API `toolbox.setVisible(false)` + 画布 `pointer-events: none`
- **C 任务升级**：判断成绩→判断等级（嵌套if）；画线→画三角形；输入→判断成年
- **沙箱编码修复**：`PYTHONIOENCODING=utf-8`

### 四阶段工具箱状态

| 阶段 | 工具箱 | 积木操作 |
|------|--------|---------|
| P | 可见 | 可自由探索 |
| A | 可见 | 可拖拽搭建 |
| C | 隐藏 | 只读观察 |
| I | 可见 | 可自由实验 |

### 当前系统状态

| 模块 | 完成度 |
|------|--------|
| 项目骨架 + 前后端通信 | ✅ 100% |
| 数据库 + 3 个任务 | ✅ 100% |
| 登录 → 任务选择 → 教学页 | ✅ 100% |
| P 阶段（子任务/积木卡片/LLM 讲解） | ✅ 90% |
| A 阶段（LLM 推断+三层评判+反馈） | ✅ 95% |
| C 阶段（积木生成+沙箱运行+LLM引导） | ✅ 80% |
| I 阶段（双向互动对话） | ⚠️ 5% |
| 数据埋点框架 | ⚠️ 30% |

### 下一步建议

**I 阶段**——P→A→C 三个核心教学环节已完成，I 阶段是最后一环。做完了 P→A→C→I 全流程闭环即可进入 Pilot 试测。

---

## 迭代 8：I 阶段实现（2026-05-14）

**目标**：P→A→C→I 全流程闭环。I 阶段实现 LLM 双向互动。

### 新增

- **IStagePanel**："开始协作"按钮触发 LLM 总结+提问；互动指南引导流程
- **Python 代码探索区**：I 阶段中栏代码编辑+运行按钮+黑底输出区
- **I 阶段 System Prompt**：学习伙伴角色，平辈口吻

### 全流程演变

```
迭代 0-2    迭代 3-5      迭代 6-7      迭代 8
 骨架+P     A评判闭环      C积木+沙箱     I互动
   │           │              │            │
   └───────────┴──────────────┴────────────┘
                P→A→C→I 闭环 ✅
```

### 最终系统状态

| 模块 | 完成度 |
|------|--------|
| 项目骨架 + 前后端通信 | ✅ 100% |
| 数据库 + 3 个任务 | ✅ 100% |
| 登录 → 任务选择 → 教学页 | ✅ 100% |
| P 阶段（子任务/积木卡片/LLM 讲解） | ✅ 90% |
| A 阶段（LLM 推断+三层评判+反馈） | ✅ 95% |
| C 阶段（积木生成+沙箱运行+LLM引导） | ✅ 85% |
| I 阶段（双向互动+代码探索） | ✅ 80% |
| Blockly 工具箱（17 种积木） | ✅ 85% |
| 数据埋点框架 | ⚠️ 30% |

### 下一步建议

1. **Pilot 试测准备**：全流程自测 3 个任务，确认 P→A→C→I 完整走通
2. **数据埋点完善**：行为数据字段确认 + 采集代码补齐
3. **界面美化**：积木颜色优化、三栏布局比例
4. **任务库扩充**：更多 Python 基础语法任务
5. **对照组系统**：fork 为静态材料版本（同平台+同任务+同流程，LLM→静态）

---

## 迭代 9：任务体系重构 + 全流程数据埋点（2026-05-14）

**目标**：4 任务梯度化设计 + 全流程行为数据可支撑 RQ5 分析。

### 任务体系

| 任务 | 新概念 | A 阶段 | C 阶段 | 难度梯度 |
|------|--------|--------|--------|---------|
| 1 | if-else | 判断及格 | 嵌套判断等级（if/elif/else） | 条件深度↑ |
| 2 | for 循环 | 重复打印短线 | 倒数计数（变量递减） | 循环应用↑ |
| 3 | input + len | 输入名字问好 | 输入长度判断 | 数据处理↑ |
| 4 | for + if + % | 奇偶分类 | 统计偶数计数 | 双概念组合↑ |

### 埋点覆盖

| 数据 | action_type | 采集位置 |
|------|------------|---------|
| 阶段进入/退出 | `stage_enter` / `stage_exit` | TeachingPage |
| P 点击子任务 | `subtask_click` | SubtaskPanel |
| P 点击积木 | `block_click`（类型+颜色） | BlockCard |
| A 提交积木 | `a_submit`（对错/缺失/值错/尝试次数） | AStagePanel |
| C 运行代码 | `c_run`（对错/尝试次数） | CStagePanel |
| C 请求提示 | `c_hint_request`（已尝试次数） | CStagePanel |
| I 开始协作 | `i_collab_start` | IStagePanel |
| I 运行代码 | `i_code_run` | IStagePanel |
| 对话收发 | `chat_send` / `chat_receive` | ChatWindow |
| 按钮点击 | `button_click` | StageButtons |

### 部署

- 生产构建：`npm run build`（前端 dist + 后端 tsx 运行）
- 同一端口：后端托管前端静态文件（访问 3001 即可）
- Docker Compose 配置就绪
- 远程服务器（82.156.85.157）部署验证通过

### 最终系统状态

| 模块 | 完成度 |
|------|--------|
| 项目骨架 + 前后端通信 | ✅ 100% |
| 数据库 + 4 个任务（梯度化） | ✅ 100% |
| 登录 → 任务选择 → 教学页 | ✅ 100% |
| P 阶段（子任务/积木卡片/LLM 讲解） | ✅ 90% |
| A 阶段（LLM 推断+三层评判+LLM 反馈） | ✅ 95% |
| C 阶段（LLM 拼接积木+沙箱运行+LLM 引导） | ✅ 85% |
| I 阶段（双向互动+代码自由探索） | ✅ 80% |
| Blockly 工具箱（17 种积木） | ✅ 85% |
| 数据埋点（全流程 10 类行为） | ✅ 90% |
| 生产构建 + 远程部署 | ✅ 100% |

---

## 迭代 10：积木名系统级注入 + 远程部署完善（2026-05-15）

**目标**：LLM 回复不再出现 `text`/`text_print` 等英文代号；服务器部署可用。

### 改动

- **`blockNames.ts`（后端）**：积木中文名对照表 `BLOCK_NAME_INDEX`，17 种积木的完整中文映射
- **chat.ts**：4 阶段 System Prompt 全部注入 `BLOCK_NAME_INDEX`，LLM 收到学生消息时自动知晓所有积木中文名
- **前端 AStagePanel**：去掉 `blockNameMap` 映射传递（之前学生可见的提示里带了大段对照表），改为简短提示
- **api.ts**：`import.meta.env.PROD` 自动判断 API 路径——开发模式用 `localhost:3001`，生产构建用 `/api`
- **服务器部署**：82.156.85.157 部署验证通过

### 当前系统状态

| 模块 | 完成度 |
|------|--------|
| 项目骨架 + 前后端通信 | ✅ 100% |
| 数据库 + 4 个任务（梯度化） | ✅ 100% |
| 登录 → 任务选择 → 教学页 | ✅ 100% |
| P 阶段（子任务/积木卡片/LLM 讲解） | ✅ 92% |
| A 阶段（LLM 推断+三层评判+LLM 反馈） | ✅ 95% |
| C 阶段（LLM 拼接积木+沙箱运行+LLM 引导） | ✅ 85% |
| I 阶段（双向互动+代码自由探索） | ✅ 85% |
| Blockly 工具箱（17 种积木） | ✅ 85% |
| 数据埋点（全流程 10 类行为） | ✅ 90% |
| 生产构建 + 远程部署 | ✅ 100% |
| LLM 积木名中文化（系统级注入） | ✅ 100% |
| 阶段按钮解锁 + 完成标记 | ✅ 100% |

---

## 迭代 12：教师端完整功能 + 系统优化（2026-05-16）

**目标**：教师端全功能就位 + 系统隐患修复 + 用户体验打磨。

### 新增功能

| 功能 | 说明 |
|------|------|
| **首页数据概览** | 4 卡片统计 + 任务完成率进度条 + 学生进度表 + 最近活动时间线 |
| **学生数据** | 列表（分组/进度/操作）+ 详情（按任务 Tab 分离操作记录）+ CSV 导出 |
| **任务管理** | 新建/表单编辑（A/C/I 阶段字段）/删除/"更新答案"按钮 |
| **提示词管理** | 4 阶段编辑保存 + 测试预览 + 积木名索引编辑 |
| **系统设置** | 教师密码修改 |
| **班级分组** | 学生列表下拉框：未分组/实验组/对照组 |
| **数据可视化** | 柱状图（A阶段通过率）+ 饼图（各阶段操作占比） |
| **学生删除** | 红色删除按钮，级联清除关联数据 |
| **登录长效化** | sessionStorage 持久化，刷新不丢登录 |
| **教师端入口独立** | `/teacher/login`，硬编码凭据 admin/admin123 |

### 修复隐患

| 隐患 | 修复 |
|------|------|
| 教师密码硬编码 | 系统设置页可修改，写入 .env |
| 任务编辑不刷新缓存 | 编辑 A/C 阶段代码自动清除 `inferred_blocks` |
| 各页侧边栏不一致 | 统一菜单：学生数据/任务管理/提示词管理/系统设置 |
| TaskPanel 膨胀 | 拆分为 6 个独立文件（constants + P/A/C/I StagePanel） |
| 阶段按钮锁定 | 改为自由点击，通过后打 ✅ |
| LLM 回复格式差 | 前端渲染 `**加粗**` / `\n` 换行 |
| LLM 积木代号 | 积木名索引注入 System Prompt |
| 数据埋点缺 task_id | P 阶段埋点补齐 |

### 最终系统状态（2026-05-16 迭代12）

| 模块 | 完成度 |
|------|--------|
| 项目骨架 + 前后端通信 | ✅ 100% |
| 数据库 + 4 个梯度化任务 | ✅ 100% |
| 登录 → 任务选择 → 教学页 | ✅ 100% |
| P 阶段（子任务/积木卡片/LLM 讲解） | ✅ 92% |
| A 阶段（LLM 推断+三层评判+LLM 反馈） | ✅ 95% |
| C 阶段（积木生成+沙箱运行+LLM 引导） | ✅ 85% |
| I 阶段（双向互动+代码自由探索） | ✅ 85% |
| Blockly 工具箱（17 种积木） | ✅ 85% |
| 数据埋点（全流程 10 类行为） | ✅ 90% |
| 生产构建 + 远程部署 | ✅ 100% |
| 教师端（5 个核心模块） | ✅ 90% |

---

## 迭代 13：UI 全面美化 + 收尾（2026-05-16）

**目标**：产品级界面打磨，学生端和教师端视觉统一。

### 改动

| 区域 | 改动 |
|------|------|
| 全局主题 | Ant Design 自定义主题：暖蓝 `#5B8FF9`，全局圆角 8px |
| 任务选择页 | 卡片网格布局，序号徽标，进度条，完成状态彩色标记 |
| P 阶段积木卡片 | 左侧彩色竖条+首字母圆徽标+分类色标签，展开有分割线 |
| 对话窗 | 气泡不对称圆角，每条显示时间戳 |
| 阶段进度条 | Steps 组件 P→A→C→I，当前阶段高亮 |
| 三栏布局 | 左右 flex:1 等宽，对话区固定 320px |
| 阶段按钮 | 缩小为 size="small" |
| 教师端搜索 | 学生列表新增搜索框（按学号/姓名过滤） |

### 最终系统状态

| 模块 | 完成度 |
|------|--------|
| 学生端 P→A→C→I 全流程 | ✅ 95% |
| 教师端 5 模块 | ✅ 90% |
| 全局 UI 美化 | ✅ 85% |
| 数据埋点 | ✅ 90% |
| 部署 | ✅ 100% |

### 最终系统状态（2026-05-17 迭代 14）

| 模块 | 完成度 |
|------|--------|
| 学生端 P→A→C→I 全流程 | ✅ 95% |
| 教师端 5 模块 | ✅ 85% |
| 数据埋点 | ✅ 90% |
| 远程部署 | ✅ 100% |
| 阶段进度持久化 (localStorage) | ✅ 100% |

### Demo 链接

- 学生端：`http://localhost:5173`（学号=1，密码=1）
- 教师端：`http://localhost:5173/teacher/login`（admin / admin123）
- 远程：`http://82.156.85.157:3001`

---

## 迭代 14：系统完善收尾（2026-05-17）

### 改动清单
| 改动 | 说明 |
|------|------|
| 四阶段完成标志 | P→A按钮、A→提交通过、C→运行通过、I→开始协作。存储格式 `taskId-stage`，每任务独立不可逆 |
| 进度条修复 | 从 `current_stage` → `completedStages` 过滤计算 |
| 阶段对话独立 | 切换阶段自动保存/恢复，sessionStorage 持久化 |
| 刷新不掉数据 | user/selectedTask/chat 全部持久化 |
| completedStages → localStorage | 重登不丢失 |
| 教师端恢复默认按钮 | 提示词每阶段+积木名索引各一个 |
| CSV BOM | `\uFEFF` 解决乱码 |
| 积木区重置按钮 | P/A/I 阶段可用 |
| Docker 部署配置 | 就绪 |
| i18n 尝试 → 回滚 | 删除所有多语言代码，保持纯中文 |

---

## 迭代 14：系统完善收尾（2026-05-17）

**目标**：阶段完成标志修正、对话上下文、数据持久化、远程部署同步。

### 改动

| 改动 | 说明 |
|------|------|
| 四阶段完成标志 | P→点击A按钮、A→提交通过、C→运行通过、I→开始协作。存储格式 `taskId-stage`，每任务独立不可逆 |
| 进度条修复 | 从 `current_stage` 位置计算 → `completedStages` 过滤计算 |
| 大模型上下文 | 发送最近 10 条对话作为历史 |
| System Prompt 精简 | 每次回复控制在 2-5 句话 |
| 各阶段对话独立 | 切换阶段自动保存/恢复，`sessionStorage` 持久化 |
| 刷新不掉数据 | `user`/`selectedTask`/`completedStages`/`chat` 全部 `sessionStorage` 持久化 |
| 教师端恢复默认 | 提示词每阶段+积木名索引各一个"恢复默认"按钮 |
| CSV 导出乱码 | 加 `\uFEFF` UTF-8 BOM |
| 积木区重置按钮 | P/A/I 阶段可用 |
| Docker 部署配置 | Dockerfile + docker-compose.yml（待服务器装 Docker） |
| 服务器同步 | 完整数据库导入+代码更新，`82.156.85.157:3001` 可用 |

### 最终系统状态

| 模块 | 完成度 |
|------|--------|
| 学生端 P→A→C→I | ✅ 95% |
| 教师端 5 模块 | ✅ 85% |
| 数据埋点 | ✅ 90% |
| 远程部署 | ✅ 100% |

### Demo 链接

- 学生端：`http://82.156.85.157:3001`（测试：学号=1，密码=1）
- 教师端：`http://82.156.85.157:3001/teacher/login`（admin / admin123）
- 本地开发：`http://localhost:5173`

```
frontend/src/
├── pages/
│   ├── LoginPage.tsx       学生登录（学号+密码）
│   ├── TaskSelectPage.tsx  任务选择（全部解锁）
│   ├── TeachingPage.tsx    P→A→C→I 控制器
│   └── teacher/            教师端 7 个页面
├── components/
│   ├── Layout/             TeachingLayout
│   ├── BlocklyEditor/      Blockly + customBlocks(17种)
│   ├── TaskPanel/          6 个文件（constants+P/A/C/I StagePanel+路由）
│   ├── ChatWindow/         对话窗（支持 Markdown 渲染）
│   └── StageController/    阶段按钮（自由切换+完成标记）
├── store/                  useAppStore（Zustand）
└── services/               6 个 API 层

backend/src/
├── routes/                 7 个路由文件
├── services/               6 个服务（推断+XML+名映射+提示词）
└── config/                 MySQL 连接+建表
```

**目标**：登录流程、阶段导航、LLM 交互、代码结构的全面改进。

### 改动列表

| # | 改动 | 说明 |
|---|------|------|
| 1 | 登录页 | 姓名+学号 → **学号+密码+角色选择**（学生/教师）。后端 auth 同步改造 |
| 2 | 任务选择 | **解除顺序锁定**，全部任务自由进入。进度状态（进行中/已完成）保留 |
| 3 | P 阶段积木卡片 | 从全局单选 → **本地独立展开/收起**，可同时打开多个积木 |
| 4 | 任务说明框 | P 阶段中栏新增灰色背景任务描述 |
| 5 | LLM 系统消息隐藏 | `setPendingSystemMessage` 触发的消息**对学生完全隐藏**，右侧只显示 LLM 友好回复 |
| 6 | LLM 回复格式化 | 前端 ChatWindow 渲染 `**加粗**` → `<strong>`，`\n` → `<br/>` |
| 7 | LLM 范围限定 | System Prompt 严格限定**只回答 Python 教学问题** |
| 8 | 提示词接口化 | 抽到 `backend/src/services/prompts.ts`，教师端可编辑 |
| 9 | 阶段按钮 | 四按钮**全部可自由点击**，通过后打 ✅。删除"跳过"按钮 |
| 10 | 刷新会话保持 | `sessionStorage` 存取登录信息，刷新不掉 |
| 11 | TaskPanel 重构 | 493 行单文件 → 6 个独立文件（constants, P/A/C/I StagePanel） |

### 代码结构（重构后）

```
frontend/src/components/TaskPanel/
├── TaskPanel.tsx      (40 行，路由)
├── constants.ts       (24 行，颜色/标签)
├── PStagePanel.tsx    (P 阶段：子任务+积木卡片)
├── AStagePanel.tsx    (A 阶段：提交评判)
├── CStagePanel.tsx    (C 阶段：代码沙箱)
└── IStagePanel.tsx    (I 阶段：互动协作)
```

### 下一步建议

1. **4 任务全流程自测**：逐个任务走 P→A→C→I，确认无断点
2. **积木卡片 → Blockly 积木 UI**：P 阶段积木展示从文字卡片换为真实 Blockly 积木渲染
3. **界面打磨**：积木颜色优化、三栏比例调整
4. **对照组系统**：fork 静态材料版本
5. **Dashboard 数据面板**：基于 `user_actions` 表做行为数据可视化

### 下一步建议

1. **Pilot 全流程自测**：4 个任务逐个走 P→A→C→I，确认无断点
2. **界面打磨**：积木颜色、三栏比例、移动端适配
3. **对照组系统**：基于现有代码 fork 静态材料版本（同平台同任务，LLM→静态文本+自动对错+检查清单）

---

## 迭代 15：系统架构优化 + 安全加固（2026-05-18）

**目标**：代码结构理顺，安全漏洞修复，中英文双版本对齐。

### 新增

| 模块 | 说明 |
|------|------|
| **认证中间件**（`backend/src/middleware/auth.ts`） | Session token 验证，学生/教师权限区分 |
| **密码哈希**（`backend/src/utils/hash.ts`） | SHA-256 + 随机盐 |
| **频率限制**（`backend/src/middleware/rateLimit.ts`） | 对话接口 30 次/分钟 |
| **全局错误处理**（`backend/src/middleware/errorHandler.ts`） | 统一 500 响应 |
| **React Error Boundary**（`frontend/src/components/ErrorBoundary.tsx`） | 异常捕获友好提示 |

### 架构重组

| 变更 | 说明 |
|------|------|
| **teacher.ts 拆分** | 457 行 → 5 个模块（stats/students/tasks/prompts/settings） |
| **提示词/积木名 → DB** | 从写 `.ts` 文件 → 存 `system_config` 表，移除 `eval()` |
| **updateStage 解耦** | 不再自动设 completed，新增 `/api/task/complete` 独立接口 |
| **startTask 保护** | 不重置已进行中/已完成的任务 |

### 修复
- `varchar(100)` → `varchar(200)` 适配 scrypt 哈希长度
- BlocklyEditor 初始化 `readOnly: false` 修复工具箱不显示
- 移除 C 阶段代码骨架自动填充
- `variables_get` 从积木名索引中清理

---

## 迭代 16：英文版系统 + 远程部署（2026-05-18～19）

**目标**：创建英文版完整系统，部署到远程服务器替换旧版。

### 新增

| 项目 | 说明 |
|------|------|
| **platform-en/** | 完整英文版目录（前端 + 后端 + 数据库） |
| **英文 Blockly 积木** | 17 种积木标签英文化 |
| **英文 LLM Prompt** | 4 阶段 System Prompt + 积木名对照表英译 |
| **英文 UI** | 所有页面/组件文字翻译（含 Ant Design 默认英文 locale） |
| **英文任务数据** | 4 个任务完整翻译（P/A/C/I 阶段含积木解释） |
| **远程部署** | `82.156.85.157:3001`，nginx 反向代理，icap_platform_english 数据库 |

### 系统对照

| 版本 | 前端 | 后端 | 数据库 |
|------|------|------|--------|
| 中文版 | `localhost:5173` | `localhost:3001` | `icap_platform` |
| 英文版 | `localhost:5174` | `localhost:3002` | `icap_platform_english` |
| 远程 | `82.156.85.157:3001` | 同端口 | `icap_platform_english` |

---

## 迭代 17：I 阶段逻辑完善 + 进度不可逆（2026-05-19）

**目标**：修复 I 阶段完成逻辑和进度回溯问题。

### 改动

| 改动 | 说明 |
|------|------|
| **I 阶段自动完成** | P/A/C 全部完成 + 对话 ≥ 5 轮后自动标记完成 |
| **对话轮数追踪** | `useAppStore` 新增 `dialogTurnCount`，存入 `localStorage` |
| **移除手动完成按钮** | 不再需要手动点击"完成本任务" |
| **进度不可逆** | 任务选择页进度条和状态统一由 `localStorage` 驱动，重登不丢失 |
| **`/api/task/complete`** | 新增独立完成接口，解耦阶段切换 |
| **教师端中文 locale 修复** | 英文版 `App.tsx` 移除 `zhCN` |

---

## 迭代 18：LLM 触发控制 + C 阶段增强反馈 + 埋点修复（2026-05-19）

| 改动 | 说明 |
|------|------|
| **LLM 触发仅一次** | 每阶段在同一登录会话中仅触发一次自动对话（`triggeredStages`，sessionStorage） |
| **C 阶段错误反馈增强** | 代码运行失败时传给 LLM：积木 XML + 标准答案 + 学生代码 + stdout/stderr |
| **chat_send 埋点补 task_id** | 教师端学生数据中现在能看到学生发送的消息 |
| **服务器清理** | 删除远程服务器上全部代码和数据库，仅保留本地 |

---

## 迭代 19：服务器常开配置（2026-05-19）

| 改动 | 说明 |
|------|------|
| **systemd 服务** | `blockpython.service`（Restart=always，开机自启） |
| **noexec 问题** | `/home` 挂载 noexec 导致 209/STDOUT，改用 root + bash -c 解决 |

---

## 迭代 20：全面 UI 美化（2026-05-19）

**目标**：基于 ui-ux-pro-max 设计系统，将界面从 demo 级提升到产品级。

### 配色

| 角色 | 旧值 | 新值 |
|------|------|------|
| 主色 | `#5B8FF9` | `#4361ee` |
| 成功 | `#52C41A` | `#2ec4b6` |
| 警告 | `#FA8C16` | `#ff9f1c` |
| 背景 | 白色 | `#f8f9fa` |

### 页面改动

| 页面 | 改动 |
|------|------|
| **登录页** | 渐变背景 + 装饰圆 + 毛玻璃卡片 + 品牌 icon + 圆角输入 + 按钮阴影 |
| **任务选择** | 顶部导航 + 彩色左边条 + 圆角序号徽标 + 渐变色进度条 + 横向卡片 |
| **教学页** | 三栏固定宽度 380/auto/320 + 面板阴影 + 标题色 + emoji 图标 |
| **积木区** | emoji 工具箱分类 + 画布阴影 |
| **任务区** | 卡片式子任务 + 步骤序号 + 展开动画（fadeInUp stagger） |
| **对话区** | 角色头像 + 气泡不对称圆角 + 关键词高亮 + 输入框聚焦动画 |
| **按钮** | 阶段按钮圆角胶囊形 + 当前态放大 + 已完成绿色对勾 |

### 动效

- `fadeInUp` / `scaleIn` 关键帧
- 卡片 hover 上浮 2px + 阴影加深
- 全局 `transition: all 0.2s cubic-bezier`
- `prefers-reduced-motion` 支持

### 设计系统来源

| 域名 | 推荐 |
|------|------|
| style | Micro-interactions |
| pattern | Minimal Single Column |
| typography | Baloo 2 + Comic Neue（kids-friendly） |
| color | Learning indigo + progress green |
