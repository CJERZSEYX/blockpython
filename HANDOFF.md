# 积木学Python — 系统接手文档

> 最后更新：2026-05-19（20 轮迭代）  
> 当前状态：中英文双版本系统就绪，已完成产品级 UI 美化

---

## 一、项目概述

**课题**：基于 LLM 的阶段式编程学习平台  
**目标**：帮助 Scratch 学生平滑过渡到 Python 文本编程  
**教学模型**：四阶段（P→A→C→I），LLM 动态切换四种角色  
**当前状态**：中英文双版本系统就绪

---

## 二、快速启动

### 本地开发（4 个 PowerShell 窗口）

```powershell
# 中文版后端（端口 3001）
cd D:\工作罢了\26春\选题吗\系统\platform\backend
npm run dev

# 中文版前端（端口 5173）
cd D:\工作罢了\26春\选题吗\系统\platform\frontend
npm run dev

# 英文版后端（端口 3002）
cd D:\工作罢了\26春\选题吗\系统\platform-en\backend
npm run dev

# 英文版前端（端口 5174）
cd D:\工作罢了\26春\选题吗\系统\platform-en\frontend
npm run dev
```

### 访问

| 版本 | 学生端 | 教师端 | 后端 |
|------|--------|--------|------|
| 中文版 | `http://localhost:5173` | `http://localhost:5173/teacher/login` | `http://localhost:3001` |
| 英文版 | `http://localhost:5174` | `http://localhost:5174/teacher/login` | `http://localhost:3002` |

- 学生：学号=1，密码=1
- 教师：admin / admin123

### MySQL

- localhost:3306，root / 123456
- 中文版：`icap_platform`
- 英文版：`icap_platform_english`

---

## 三、代码结构

```
platform/（中文） / platform-en/（英文）
├── frontend/src/
│   ├── pages/                LoginPage / TaskSelectPage / TeachingPage + teacher/ 7页
│   ├── components/
│   │   ├── Layout/           三栏布局
│   │   ├── BlocklyEditor/    17种积木 + 英文版 blockNames
│   │   ├── TaskPanel/        P/A/C/I StagePanel + constants
│   │   ├── ChatWindow/       对话窗（Markdown渲染 + 上下文记忆）
│   │   └── StageController/  阶段按钮（触发控制 + 完成标记）
│   ├── store/useAppStore.ts  Zustand（含 triggeredStages / dialogTurnCount）
│   ├── services/             6个 API 层
│   └── types/
│
├── backend/src/
│   ├── index.ts              Express 入口
│   ├── middleware/           auth / rateLimit / errorHandler
│   ├── routes/               auth / task / chat / track / submit / infer / teacher/
│   ├── services/             configCache / blockInference / blockDefinitions / blockNames
│   └── config/               database + initDB (5表)
```

---

## 四、关键技术点

### 阶段完成逻辑（不可逆）

| 阶段 | 触发 | 存储 |
|------|------|------|
| P | 点击 A 按钮 | `localStorage: {taskId}-P` |
| A | 积木提交通过 | `{taskId}-A` |
| C | 代码运行通过 | `{taskId}-C` |
| I | P/A/C + 对话≥5轮 → 自动 | `{taskId}-I` |

进度由 `localStorage` 驱动，登出/重入不丢失。

### LLM 触发控制

- 每阶段在同一登录会话中仅触发一次自动对话
- `triggeredStages` 存于 `sessionStorage`（登出清空）
- 与 `completedStages` 独立——未完成也可以不重复触发

### C 阶段错误反馈

代码运行失败时，LLM 收到完整上下文：
- 积木 XML（前 500 字符）
- 标准答案代码
- 学生提交的代码
- stdout + stderr

### A 阶段评判引擎

```
Python代码 → LLM(一次性) → 积木需求JSON → 缓存MySQL
学生提交 → Blockly XML → 提取类型+数量+字段值 → 三层比对 → 结果
```

### 认证系统

- Session token（`x-session-token` header）
- SHA-256 加盐哈希
- 学生路由强制认证，任务公开可读
- 教师路由需教师权限

### 数据埋点

10 类事件（含 `chat_send` 已补 `task_id`），前端批量 POST。

---

## 五、数据库

| 表 | 用途 |
|----|------|
| users | 账号（含密码哈希） |
| tasks | 任务内容（JSON 含 P/A/C/I） |
| user_progress | 进度 |
| user_actions | 行为埋点 |
| system_config | 提示词/积木名缓存 |

---

## 六、常见操作

### 重启本地
```powershell
Get-Process node | Stop-Process
# 重开 npm run dev
```

### 构建生产包
```powershell
cd frontend && npm run build
```

---

## 七、注意事项

1. 首次启动时 `autoInferAllTasks` 调 LLM 推断积木需求，等待 10-20 秒
2. 改任务代码后自动清除推断缓存
3. Python 沙箱需要 `python` 命令可用
4. 英文版 `App.tsx` 不引入 `zhCN` locale
5. 英文版 `index.html` 模板为 `<html lang="en">` + `<title>BlockPython</title>`
