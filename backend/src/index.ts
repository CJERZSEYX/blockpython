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
import { teacherRouter } from "./routes/teacher";
import { learningStateRouter } from "./routes/learningState";
import { learningProfileRouter } from "./routes/learningProfile";
import createTables from "./config/initDB";
import { requireAuth, optionalAuth } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { CURRICULUM_VERSION, PROMPT_VERSION } from "./tasks/curriculum";
import { SUMMARY_PROMPT_VERSION } from "./services/learningProfiles";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 公开路由
app.use("/api/auth", authRouter);

// 任务内容可公开查看（可选认证：已登录用户附加 session 信息）
app.use("/api/task", optionalAuth, taskRouter);

// 需要学生认证的路由
app.use("/api/chat", requireAuth("student"), rateLimit(30, 60000), chatRouter);
app.use("/api/track", requireAuth("student"), trackRouter);
app.use("/api/submit", requireAuth(), submitRouter);
app.use("/api/learning-state", requireAuth("student"), learningStateRouter);
app.use("/api/learning-profile", requireAuth("student"), learningProfileRouter);

// 需要教师认证的路由
app.use("/api/teacher", requireAuth("teacher"), teacherRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    curriculum_version: CURRICULUM_VERSION,
    agent_policy_version: PROMPT_VERSION,
    summary_policy_version: SUMMARY_PROMPT_VERSION,
    student_agent_configured: Boolean(process.env.DEEPSEEK_API_KEY),
    summary_agent_configured: Boolean(process.env.SUMMARY_AGENT_API_KEY),
  });
});

const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(errorHandler);

createTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exitCode = 1;
  });
