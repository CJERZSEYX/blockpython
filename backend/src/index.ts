import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { authRouter } from "./routes/auth";
import { taskRouter } from "./routes/task";
import { chatRouter } from "./routes/chat";
import { trackRouter } from "./routes/track";
import { submitRouter } from "./routes/submit";
import { inferRouter } from "./routes/infer";
import { teacherRouter } from "./routes/teacher";
import createTables from "./config/initDB";
import { autoInferAllTasks } from "./services/autoInfer";
import { requireAuth, optionalAuth } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { errorHandler, notFound } from "./middleware/errorHandler";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 公开路由
app.use("/api/auth", authRouter);

// 任务内容可公开查看（可选认证：已登录用户附加 session 信息）
app.use("/api/task", optionalAuth, taskRouter);
app.use("/api/task", optionalAuth, inferRouter);

// 需要学生认证的路由
app.use("/api/chat", rateLimit(30, 60000), requireAuth("student"), chatRouter);
app.use("/api/track", requireAuth("student"), trackRouter);
app.use("/api/submit", requireAuth(), submitRouter);

// 需要教师认证的路由
app.use("/api/teacher", requireAuth("teacher"), teacherRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  createTables().then(() => {
    autoInferAllTasks().catch((e) => console.error("Auto-infer failed:", e));
  });
});
