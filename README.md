# BlockPython

BlockPython 是面向初中生的积木到 Python 过渡学习平台。当前仓库保存中文实验组正式版，后续功能调整以此版本为基线。

## 核心功能

- 六个循序渐进的 Python 学习任务，覆盖顺序执行、变量、输入、条件、循环和二维综合应用。
- 任务分解、积木练习、代码挑战和拓展互动四类学习活动。
- Blockly 积木生成真实 Python，并与学生编写的 Python 使用同一套受控运行与目标判定机制。
- 小明果园场景根据程序中的变量、输出和运行轨迹呈现可视化反馈。
- 过程感知学习助手读取当前作品、运行结果、阶段摘要和学习证据，提供阶段适配支持。
- 教师端按任务查看学生作品、关键尝试、对话、学习摘要和可解释的过程证据。

## 项目结构

```text
backend/   Node.js、Express、TypeScript 后端
frontend/  React、TypeScript、Vite 学生端与教师端
```

## 本地运行

环境要求：Node.js 20 及以上、MySQL 8、Python 3。

1. 复制 `backend/.env.example` 为 `backend/.env`，填写数据库、教师账号和模型服务配置。
2. 在 `backend` 和 `frontend` 目录分别执行 `npm install`。
3. 在 `backend` 目录执行 `npm run dev`，默认地址为 `http://127.0.0.1:3001`。
4. 在 `frontend` 目录执行 `npm run dev`，默认地址为 `http://127.0.0.1:5173`。

## 验证命令

```text
cd backend
npm run build
npm run test:validation
npm run test:summary

cd ../frontend
npm run lint
npm run build
npm run test:block-connections
npm run test:stage-feedback
```

## 配置与数据

- `.env`、模型密钥、数据库内容、学生数据和运行日志不会提交到 Git。
- `backend/.env.example` 只提供配置项名称，不包含真实凭据。
- 自动化测试产生的测试账号应在测试结束后通过后端清理脚本移除。

## 版本说明

本仓库当前内容为 BlockPython 中文实验组正式版。旧中英文原型、阶段性回溯包和开发日志不属于正式源码。
