import { Router, Request, Response } from "express";
import pool from "../../config/database";
import { CURRICULUM_VERSION, PROMPT_VERSION } from "../../tasks/curriculum";
import { v4 as uuidv4 } from "uuid";
import { buildTeacherStudentReport, evidenceHash } from "../../services/teacherReport";
import { getTeacherLearningProfiles } from "../../services/learningProfiles";
import { generateTeacherAdvice, TEACHER_ADVICE_PROMPT_VERSION } from "../../services/teacherAdvice";

export const teacherStudentsRouter = Router();

function csvCell(value: unknown) {
  const text = value == null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildFilters(req: Request, userId?: string) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (userId) {
    clauses.push("a.user_id = ?");
    values.push(userId);
  }
  if (req.query.task_id) {
    clauses.push("a.task_id = ?");
    values.push(Number(req.query.task_id));
  }
  if (req.query.stage) {
    clauses.push("a.stage = ?");
    values.push(String(req.query.stage));
  }
  if (req.query.action_type) {
    clauses.push("a.action_type = ?");
    values.push(String(req.query.action_type));
  }
  if (req.query.from) {
    clauses.push("a.timestamp >= ?");
    values.push(String(req.query.from));
  }
  if (req.query.to) {
    clauses.push("a.timestamp <= ?");
    values.push(String(req.query.to));
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function buildChatFilters(req: Request, userId: string) {
  const clauses = ["c.user_id = ?"];
  const values: unknown[] = [userId];
  if (req.query.task_id) {
    clauses.push("c.task_id = ?");
    values.push(Number(req.query.task_id));
  }
  if (req.query.stage) {
    clauses.push("c.stage = ?");
    values.push(String(req.query.stage));
  }
  if (req.query.from) {
    clauses.push("c.created_at >= ?");
    values.push(String(req.query.from));
  }
  if (req.query.to) {
    clauses.push("c.created_at <= ?");
    values.push(String(req.query.to));
  }
  return { sql: `WHERE ${clauses.join(" AND ")}`, values };
}

teacherStudentsRouter.get("/students", async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || "").trim();
    const params: unknown[] = [];
    let where = "WHERE u.role = 'student'";
    if (search) {
      where += " AND (u.id LIKE ? OR u.name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    const [rows] = await pool.query<any[]>(
      `SELECT u.id, u.name, u.created_at,
        COUNT(DISTINCT a.id) AS action_count,
        COUNT(DISTINCT c.id) AS message_count,
        MIN(a.timestamp) AS first_activity,
        MAX(a.timestamp) AS last_activity
       FROM users u
       LEFT JOIN user_actions a ON a.user_id = u.id
       LEFT JOIN chat_messages c ON c.user_id = u.id
       ${where}
       GROUP BY u.id, u.name, u.created_at
       ORDER BY COALESCE(MAX(a.timestamp), u.created_at) DESC`,
      params
    );
    res.json({ students: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "获取学生列表失败" });
  }
});

teacherStudentsRouter.get("/students/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [students] = await pool.query<any[]>(
      "SELECT id, name, created_at FROM users WHERE id = ? AND role = 'student'",
      [id]
    );
    if (students.length === 0) {
      res.status(404).json({ error: "学生不存在" });
      return;
    }

    const filters = buildFilters(req, id);
    const [actions] = await pool.query<any[]>(
      `SELECT a.id, a.session_id, a.task_id, t.title AS task_title,
        a.stage, a.action_type, a.action_detail, a.prompt_version,
        a.timestamp, a.duration_ms
       FROM user_actions a
       LEFT JOIN tasks t ON t.id = a.task_id
       ${filters.sql}
       ORDER BY a.timestamp, a.id`,
      filters.values
    );

    const chatFilters = buildChatFilters(req, id);
    const [messages] = await pool.query<any[]>(
      `SELECT c.id, c.session_id, c.task_id, t.title AS task_title,
        c.stage, c.role, c.content, c.message_type, c.prompt_version,
        c.request_id, c.created_at
       FROM chat_messages c
       LEFT JOIN tasks t ON t.id = c.task_id
       ${chatFilters.sql}
       ORDER BY c.created_at, c.id`,
      chatFilters.values
    );
    const [tasks] = await pool.query<any[]>(
      "SELECT id, title, sort_order, suggested_lessons FROM tasks ORDER BY sort_order"
    );

    const evidenceClauses = ["user_id = ?"];
    const evidenceValues: unknown[] = [id];
    if (req.query.task_id) {
      evidenceClauses.push("task_id = ?");
      evidenceValues.push(Number(req.query.task_id));
    }
    if (req.query.stage) {
      evidenceClauses.push("stage = ?");
      evidenceValues.push(String(req.query.stage));
    }
    const [snapshots] = await pool.query<any[]>(
      `SELECT snapshot_id, task_id, stage, artifact_type, artifact_version,
              content_hash, content, generated_code, semantic_features, diagnostics,
              source_action, created_at
       FROM artifact_snapshots
       WHERE ${evidenceClauses.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT 200`,
      evidenceValues
    );
    const [interventions] = await pool.query<any[]>(
      `SELECT intervention_id, task_id, stage, trigger_type, diagnosis_code,
              support_level, artifact_version, evidence_json, message, question,
              block_id, code_line, prompt_version, outcome, followup_edits,
              created_at, resolved_at
       FROM agent_interventions
       WHERE ${evidenceClauses.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT 200`,
      evidenceValues
    );
    const [learnerStates] = await pool.query<any[]>(
      `SELECT knowledge_component, state, success_count, error_count,
              independent_success_count, last_evidence_id, last_task_id,
              last_stage, last_diagnosis, evidence_json, updated_at
       FROM learner_states WHERE user_id = ? ORDER BY knowledge_component`,
      [id]
    );

    res.json({
      student: students[0], actions, messages, tasks,
      artifact_snapshots: snapshots,
      learner_states: learnerStates,
      agent_interventions: interventions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "获取学生详情失败" });
  }
});

teacherStudentsRouter.get("/students/:id/report", async (req: Request, res: Response) => {
  try {
    const report = await buildTeacherStudentReport(req.params.id);
    if (!report) {
      res.status(404).json({ error: "学生不存在" });
      return;
    }
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "学习过程报告加载失败" });
  }
});

teacherStudentsRouter.get("/students/:id/profile", async (req: Request, res: Response) => {
  try {
    const [students] = await pool.query<any[]>(
      "SELECT id,name FROM users WHERE id=? AND role='student' LIMIT 1",
      [req.params.id]
    );
    if (!students.length) {
      res.status(404).json({ error: "学生不存在" });
      return;
    }
    res.json({ student: students[0], ...(await getTeacherLearningProfiles(req.params.id)) });
  } catch (error) {
    console.error("Teacher learning profile error:", error);
    res.status(500).json({ error: "学习证据画像加载失败" });
  }
});

teacherStudentsRouter.post("/students/:id/tasks/:taskId/advice", async (req: Request, res: Response) => {
  try {
    const report = await buildTeacherStudentReport(req.params.id);
    const taskId = Number(req.params.taskId);
    const task = report?.tasks.find((item) => item.id === taskId);
    if (!report || !task) {
      res.status(404).json({ error: "学生或任务不存在" });
      return;
    }
    const generated = await generateTeacherAdvice(task);
    const advice = generated.content;
    const reportId = uuidv4();
    const updatedAt = task.evidence_updated_at ? new Date(task.evidence_updated_at) : null;
    await pool.query(
      `INSERT INTO teacher_evidence_reports
       (report_id,student_id,task_id,evidence_hash,evidence_updated_at,report_json,model_name,prompt_version)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        reportId,
        req.params.id,
        taskId,
        evidenceHash(generated.evidence),
        updatedAt,
        JSON.stringify(advice),
        generated.model || "deterministic-fallback",
        TEACHER_ADVICE_PROMPT_VERSION,
      ]
    );
    res.json({
      report_id: reportId,
      content: advice,
      stale: false,
      created_at: new Date().toISOString(),
      source: generated.source,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI教学建议生成失败" });
  }
});

teacherStudentsRouter.get("/students/:id/export.csv", async (req: Request, res: Response) => {
  try {
    const report = await buildTeacherStudentReport(req.params.id);
    if (!report) {
      res.status(404).json({ error: "学生不存在" });
      return;
    }
    const headers = [
      "学号", "姓名", "任务序号", "任务名称", "有效学习时间", "积木练习目标",
      "代码挑战目标", "关键尝试次数", "主动求助次数", "主要困难", "最近证据时间",
    ];
    const csv = [
      headers.join(","),
      ...report.tasks.map((task, index) => [
        report.student.id,
        report.student.name,
        index + 1,
        task.title,
        task.active_time_label,
        task.a_completed ? "已达成" : "未达成",
        task.c_completed ? "已达成" : "未达成",
        task.attempt_count,
        task.hint_count,
        task.difficulties.map((item) => `${item.label}（${item.count}次）`).join("；") || "尚未观察到重复困难",
        task.evidence_updated_at || "",
      ].map(csvCell).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=student_${req.params.id}_summary.csv`);
    res.send("\uFEFF" + csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CSV导出失败" });
  }
});

teacherStudentsRouter.get("/students/:id/export.json", async (req: Request, res: Response) => {
  try {
    const filters = buildFilters(req, req.params.id);
    const [actions] = await pool.query<any[]>(
      `SELECT a.*, t.title AS task_title
       FROM user_actions a
       LEFT JOIN tasks t ON t.id = a.task_id
       ${filters.sql}
       ORDER BY a.timestamp, a.id`,
      filters.values
    );
    const chatFilters = buildChatFilters(req, req.params.id);
    const [messages] = await pool.query<any[]>(
      `SELECT c.*, t.title AS task_title
       FROM chat_messages c
       LEFT JOIN tasks t ON t.id = c.task_id
       ${chatFilters.sql}
       ORDER BY c.created_at, c.id`,
      chatFilters.values
    );
    const [snapshots] = await pool.query<any[]>(
      "SELECT * FROM artifact_snapshots WHERE user_id = ? ORDER BY created_at, id",
      [req.params.id]
    );
    const [learnerStates] = await pool.query<any[]>(
      "SELECT * FROM learner_states WHERE user_id = ? ORDER BY knowledge_component",
      [req.params.id]
    );
    const [interventions] = await pool.query<any[]>(
      "SELECT * FROM agent_interventions WHERE user_id = ? ORDER BY created_at, id",
      [req.params.id]
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=student_${req.params.id}_full.json`);
    res.json({
      exported_at: new Date().toISOString(),
      student_id: req.params.id,
      filters: req.query,
      curriculum_version: CURRICULUM_VERSION,
      prompt_version: PROMPT_VERSION,
      actions,
      chat_messages: messages,
      artifact_snapshots: snapshots,
      learner_states: learnerStates,
      agent_interventions: interventions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "JSON导出失败" });
  }
});

teacherStudentsRouter.get("/students/:id/evidence.csv", async (req: Request, res: Response) => {
  try {
    const [states] = await pool.query<any[]>(
      `SELECT user_id, knowledge_component, state, success_count, error_count,
              independent_success_count, last_task_id, last_stage,
              last_diagnosis, last_evidence_id, updated_at
       FROM learner_states WHERE user_id = ? ORDER BY knowledge_component`,
      [req.params.id]
    );
    const headers = [
      "user_id", "knowledge_component", "state", "success_count", "error_count",
      "independent_success_count", "last_task_id", "last_stage", "last_diagnosis",
      "last_evidence_id", "updated_at",
    ];
    const csv = [
      headers.join(","),
      ...states.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=student_${req.params.id}_learning_evidence.csv`);
    res.send("\uFEFF" + csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "学习证据CSV导出失败" });
  }
});

teacherStudentsRouter.get("/export.csv", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT u.id, u.name, COUNT(DISTINCT a.id) AS action_count,
        COUNT(DISTINCT c.id) AS message_count, MAX(a.timestamp) AS last_activity
       FROM users u
       LEFT JOIN user_actions a ON a.user_id = u.id
       LEFT JOIN chat_messages c ON c.user_id = u.id
       WHERE u.role = 'student'
       GROUP BY u.id, u.name
       ORDER BY u.id`
    );
    const headers = ["id", "name", "action_count", "message_count", "last_activity"];
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=experiment_students.csv");
    res.send("\uFEFF" + csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CSV导出失败" });
  }
});

teacherStudentsRouter.get("/export.json", async (_req: Request, res: Response) => {
  try {
    const [students] = await pool.query<any[]>(
      "SELECT id, name, created_at FROM users WHERE role = 'student' ORDER BY id"
    );
    const [actions] = await pool.query<any[]>(
      "SELECT * FROM user_actions ORDER BY user_id, timestamp, id"
    );
    const [messages] = await pool.query<any[]>(
      "SELECT * FROM chat_messages ORDER BY user_id, created_at, id"
    );
    const [tasks] = await pool.query<any[]>(
      "SELECT id, title, description, sort_order, suggested_lessons, version FROM tasks WHERE version = ? ORDER BY sort_order",
      [CURRICULUM_VERSION]
    );
    const [snapshots] = await pool.query<any[]>(
      "SELECT * FROM artifact_snapshots ORDER BY user_id, created_at, id"
    );
    const [learnerStates] = await pool.query<any[]>(
      "SELECT * FROM learner_states ORDER BY user_id, knowledge_component"
    );
    const [interventions] = await pool.query<any[]>(
      "SELECT * FROM agent_interventions ORDER BY user_id, created_at, id"
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=experiment_full_data.json");
    res.json({
      exported_at: new Date().toISOString(),
      curriculum_version: CURRICULUM_VERSION,
      prompt_version: PROMPT_VERSION,
      tasks,
      students,
      actions,
      chat_messages: messages,
      artifact_snapshots: snapshots,
      learner_states: learnerStates,
      agent_interventions: interventions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "JSON导出失败" });
  }
});
