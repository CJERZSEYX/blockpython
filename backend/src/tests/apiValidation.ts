import assert from "node:assert/strict";
import dotenv from "dotenv";
import { generatePythonFromBlockly } from "../services/blocklyPython";
import { CURRICULUM_VERSION } from "../tasks/curriculum";
import pool from "../config/database";
import { deleteStudentsByIds } from "../services/testDataCleanup";

dotenv.config();
const baseUrl = process.env.API_URL || "http://127.0.0.1:3001/api";
const studentId = `qa_learning_state_${Date.now()}`;

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  assert.ok(response.ok, `${path} failed: ${response.status} ${JSON.stringify(body)}`);
  return body as any;
}

async function requestWithStatus(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  const login = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ student_id: studentId, password: "qa-pass" }),
  });
  const headers = {
    "content-type": "application/json",
    "x-session-token": login.session_id as string,
  };

  const list = await request("/task/list", { headers });
  assert.equal(list.tasks.length, 6);
  assert.equal(list.tasks[0].title, "顺序执行与输出");

  const emptyRecent = await request("/learning-state/recent", { headers });
  assert.equal(emptyRecent.state, null);

  for (let taskId = 1; taskId <= 6; taskId += 1) {
    const detail = await request(`/task/${taskId}`, { headers });
    const task = detail.task;
    assert.equal(task.version, CURRICULUM_VERSION);
    assert.equal(task.content_json.visualization.type, "variable_map");
    assert.equal(
      task.content_json.visualization.coordinate_help,
      taskId === 1 ? "hidden" : taskId === 2 ? "full" : "compact"
    );
    assert.equal(
      task.content_json.visualization.collection_help,
      taskId === 1 ? "none" : taskId === 4 ? "stacked" : "single"
    );
    assert.ok(task.content_json.i_stage.ui_copy?.planning);
    assert.equal(
      task.content_json.toolbox.some((type: string) => type.startsWith("stage_")),
      false
    );
    const generated = generatePythonFromBlockly(task.content_json.c_stage.blocks_xml);
    assert.equal(generated.valid, true, `Task ${taskId} C XML should be valid`);
    const input = taskId === 3 || taskId === 6 ? "苹果" : "";
    const lockedC = await requestWithStatus(`/learning-state/${taskId}/stage`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ stage: "C" }),
    });
    assert.equal(lockedC.status, 403);
    if (taskId === 1) {
      const lockedExecute = await requestWithStatus("/submit/execute", {
        method: "POST",
        headers,
        body: JSON.stringify({ task_id: taskId, stage: "C", code: generated.code }),
      });
      assert.equal(lockedExecute.status, 403);
      const lockedChat = await requestWithStatus("/chat/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ task_id: taskId, stage: "C", messages: [{ role: "user", content: "test" }] }),
      });
      assert.equal(lockedChat.status, 403);
    }

    const aRunForUnlock = await request("/submit/execute", {
      method: "POST",
      headers,
      body: JSON.stringify({
        task_id: taskId,
        stage: "A",
        blockly_xml: task.content_json.c_stage.blocks_xml,
        input,
        attempt: 1,
      }),
    });
    assert.equal(aRunForUnlock.status, "target_met");
    assert.equal(aRunForUnlock.learning_state.a_completed, true);
    if (taskId === 1) {
      const completedStageChat = await request("/chat/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          task_id: taskId,
          stage: "A",
          messages: [{ role: "user", content: "我还需要修改吗？" }],
          client_message_id: `completed-stage-${studentId}`,
        }),
      });
      assert.match(
        completedStageChat.choices[0].message.content,
        /这个阶段已经完成了.*代码挑战/
      );
    }

    const enteredC = await request(`/learning-state/${taskId}/stage`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ stage: "C" }),
    });
    assert.equal(enteredC.state.a_reference_hidden, true);
    const lockedI = await requestWithStatus(`/learning-state/${taskId}/stage`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ stage: "I" }),
    });
    assert.equal(lockedI.status, 403);

    const run = await request("/submit/execute", {
      method: "POST",
      headers,
      body: JSON.stringify({
        task_id: taskId,
        stage: "C",
        code: generated.code,
        input,
        attempt: 1,
      }),
    });
    assert.equal(run.status, "target_met", `Task ${taskId}: ${JSON.stringify(run)}`);
    if (taskId === 3 || taskId === 6) {
      assert.deepEqual(run.behavior_coverage, { tested: 2, passed: 2, all_passed: true });
    }
    assert.equal(run.learning_state.c_completed, true);

    if (taskId === 1) {
      const completedCodeStageIntro = await request("/chat/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          task_id: taskId,
          stage: "C",
          trigger: "stage_intro",
          messages: [],
          request_key: `completed-c-intro-${studentId}`,
        }),
      });
      assert.equal(completedCodeStageIntro.skipped, true, JSON.stringify(completedCodeStageIntro));
      assert.equal(completedCodeStageIntro.reason, "completed_stage_intro");
    }

    const enteredI = await request(`/learning-state/${taskId}/stage`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ stage: "I" }),
    });
    assert.equal(enteredI.state.last_stage, "I");
  }

  const oneBranchOnly = await request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({
      task_id: 3,
      stage: "C",
      input: "苹果",
      attempt: 2,
      code: [
        "x = 0",
        "y = 0",
        'target = input("你想拿苹果还是梨？")',
        'if target == "苹果":',
        "    x = x + 2",
        "else:",
        "    y = y + 1",
      ].join("\n"),
    }),
  });
  assert.equal(oneBranchOnly.status, "target_mismatch");
  assert.deepEqual(oneBranchOnly.behavior_coverage, { tested: 2, passed: 1, all_passed: false });

  await pool.query(
    `UPDATE student_task_states
     SET a_completed_at = NULL, c_completed_at = CURRENT_TIMESTAMP(3),
         a_reference_hidden = 1, last_stage = 'I', history_initialized = 1
     WHERE user_id = ? AND task_id = 6`,
    [studentId]
  );
  const repairedHierarchy = await request("/learning-state/6", { headers });
  assert.equal(repairedHierarchy.state.a_completed, false);
  assert.equal(repairedHierarchy.state.c_completed, false);
  assert.equal(repairedHierarchy.state.a_reference_hidden, false);
  assert.equal(repairedHierarchy.state.last_stage, "A");

  const savedDraft = await request("/learning-state/1/draft", {
    method: "PUT",
    headers,
    body: JSON.stringify({ stage: "I", content: "print('draft restore')" }),
  });
  assert.equal(savedDraft.state.drafts.I, "print('draft restore')");
  const restoredState = await request("/learning-state/1", { headers });
  assert.equal(restoredState.state.drafts.I, "print('draft restore')");
  assert.equal(restoredState.state.a_reference_hidden, true);

  const task2 = (await request("/task/2", { headers })).task;
  const aRun = await request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({
      task_id: 2,
      stage: "A",
      blockly_xml: task2.content_json.c_stage.blocks_xml,
      attempt: 1,
    }),
  });
  assert.equal(aRun.status, "target_met");
  assert.ok(aRun.artifact_version > 0);
  assert.ok(aRun.learning_diagnostics.every((item: any) => item.resolved));
  assert.equal(aRun.variables.x, 2);
  assert.deepEqual(aRun.stage_state.collected, ["right"]);
  assert.equal(aRun.generated_code.includes("move_"), false);
  const movementEvent = aRun.events.find(
    (event: any) => event.type === "stage"
      && ["move", "collect"].includes(event.action)
      && event.payload?.authoritative !== false
      && event.payload?.to_x === 2
  );
  assert.ok(movementEvent);
  assert.equal(movementEvent.line, 4);
  assert.equal(movementEvent.payload.from_x, 0);
  assert.equal(movementEvent.payload.delta_x, 2);

  const repeatedOperationId = `qa-run-repeat-${Date.now()}`;
  const repeatedRunBody = {
    task_id: 2,
    stage: "C",
    code: generatePythonFromBlockly(task2.content_json.c_stage.blocks_xml).code,
    attempt: 1,
    operation_id: repeatedOperationId,
    artifact_hash: "qa-task2-repeat",
    artifact_version: 1,
  };
  const repeatedRuns = await Promise.all(Array.from({ length: 10 }, () => request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify(repeatedRunBody),
  })));
  assert.ok(repeatedRuns.every((run) => run.status === "target_met"));
  assert.equal(new Set(repeatedRuns.map((run) => run.artifact_snapshot_id)).size, 1);
  assert.equal(repeatedRuns.filter((run) => run.deduplicated === true).length, 9);

  const invalidStructure = await request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({
      task_id: 1,
      stage: "A",
      blockly_xml:
        '<xml xmlns="https://developers.google.com/blockly/xml">' +
        '<block type="text_print" id="missing-input"></block></xml>',
      attempt: 1,
    }),
  });
  assert.equal(invalidStructure.status, "invalid_structure");
  assert.equal(invalidStructure.started, false);
  assert.equal(invalidStructure.learning_diagnostics[0].code, "block_missing_input");
  assert.equal(invalidStructure.learning_diagnostics[0].block_id, "missing-input");

  const transferSyntax = await request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({ task_id: 2, stage: "C", code: "x =", attempt: 2 }),
  });
  assert.equal(transferSyntax.status, "syntax_error");
  assert.equal(
    transferSyntax.learning_diagnostics[0].code,
    "blocks_to_python_syntax_transfer"
  );

  const customFunction = await request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({ task_id: 1, stage: "C", code: "move_right()", attempt: 2 }),
  });
  assert.equal(customFunction.status, "syntax_error");
  assert.equal(customFunction.started, false);

  const emptyCode = await request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({ task_id: 1, stage: "C", code: "", attempt: 3 }),
  });
  assert.equal(emptyCode.status, "syntax_error");
  assert.equal(emptyCode.started, false);

  const task2I = task2.content_json.i_stage;
  const iRun = await request("/submit/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({
      task_id: 2,
      stage: "I",
      code: "x = 0\ny = 0\nsteps = 2\nx = x + steps\nx = x - steps\ny = y + steps",
      attempt: 1,
    }),
  });
  assert.equal(iRun.status, "target_met", JSON.stringify({ target: task2I.target, run: iRun }));
  assert.deepEqual(iRun.stage_state.collected, ["right", "down"]);

  const systemRequestKey = `qa-agent-repeat-${Date.now()}`;
  await pool.query(
    `INSERT INTO user_actions
      (user_id, session_id, task_id, stage, action_type, action_detail, prompt_version)
     VALUES (?, ?, 1, 'P', 'llm_interaction', ?, ?)`,
    [studentId, login.session_id, JSON.stringify({ trigger: "stage_intro", qa_seed: true }), "icap-multilevel-profile-agent-v5"],
  );
  const chatBody = {
    messages: [],
    stage: "P",
    task_id: 1,
    trigger: "stage_intro",
    message_type: "system_trigger",
    request_key: systemRequestKey,
  };
  const repeatedChatReplies = await Promise.all(Array.from({ length: 10 }, () => request("/chat/send", {
    method: "POST",
    headers,
    body: JSON.stringify(chatBody),
  })));
  assert.equal(repeatedChatReplies[0].skipped, true);
  assert.equal(repeatedChatReplies.filter((reply) => reply.deduplicated === true).length, 9);
  const duplicateReply = await request("/chat/send", {
    method: "POST",
    headers,
    body: JSON.stringify(chatBody),
  });
  assert.equal(duplicateReply.deduplicated, true);
  if (process.env.RUN_LLM_API_TESTS === "1") {
    const emptyWorkspaceHint = await request("/chat/send", {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [], stage: "A", task_id: 6, trigger: "hint_request",
        message_type: "system_trigger", blockly_xml: "",
        request_key: `qa-empty-hint-${Date.now()}`,
      }),
    });
    const emptyWorkspaceReply = String(emptyWorkspaceHint.choices[0].message.content);
    assert.equal(
      /(你已经|你已|你现在已经|你成功).{0,32}(设成|设为|设置|创建|放入|连接|搭好|搭建|完成|添加|拖出)/.test(emptyWorkspaceReply),
      false,
      emptyWorkspaceReply,
    );
  }
  const skippedInactivity = await request("/chat/send", {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [],
      stage: "A",
      task_id: 6,
      trigger: "inactivity",
      message_type: "system_trigger",
      blockly_xml: "",
    }),
  });
  assert.equal(skippedInactivity.skipped, true);

  const teacherLogin = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      student_id: process.env.TEACHER_USER || "admin",
      password: process.env.TEACHER_PASS || "admin123",
      role: "teacher",
    }),
  });
  const teacherHeaders = { "x-session-token": teacherLogin.session_id as string };
  const students = await request("/teacher/students", { headers: teacherHeaders });
  assert.ok(students.students.some((student: { id: string }) => student.id === studentId));
  const detail = await request(`/teacher/students/${studentId}`, { headers: teacherHeaders });
  assert.ok(detail.actions.length >= 8);
  assert.ok(detail.actions.some((action: { action_type: string; action_detail: any }) =>
    action.action_type === "c_run"
    && JSON.parse(typeof action.action_detail === "string" ? action.action_detail : JSON.stringify(action.action_detail)).code === ""
  ));
  assert.ok(detail.actions.some((action: { action_type: string }) => action.action_type === "i_run"));
  assert.ok(detail.artifact_snapshots.length > 0);
  assert.ok(detail.learner_states.length > 0);
  assert.ok(Array.isArray(detail.agent_interventions));
  const report = await request(`/teacher/students/${studentId}/report`, { headers: teacherHeaders });
  assert.equal(report.tasks.length, 6);
  assert.ok("course_profile" in report);
  assert.ok(report.tasks.every((task: Record<string, unknown>) => "stage_summaries" in task && "task_profile" in task));
  const profiles = await request(`/teacher/students/${studentId}/profile`, { headers: teacherHeaders });
  assert.ok(Array.isArray(profiles.stage_summaries));
  assert.ok(Array.isArray(profiles.task_profiles));
  assert.ok(report.tasks.some((task: { attempts: unknown[] }) => task.attempts.length > 0));
  assert.ok(report.tasks.every((task: Record<string, unknown>) => !("artifact_hash" in task)));
  const csv = await request(`/teacher/students/${studentId}/export.csv`, { headers: teacherHeaders });
  assert.match(String(csv), /任务名称/);
  assert.match(String(csv), /有效学习时间/);
  assert.doesNotMatch(String(csv), /a_submit|c_run/);
  const evidenceCsv = await request(`/teacher/students/${studentId}/evidence.csv`, { headers: teacherHeaders });
  assert.match(String(evidenceCsv), /knowledge_component/);
  const json = await request(`/teacher/students/${studentId}/export.json`, { headers: teacherHeaders });
  assert.equal(json.student_id, studentId);
  assert.equal(json.curriculum_version, CURRICULUM_VERSION);
  assert.ok(json.artifact_snapshots.length > 0);
  assert.ok(json.learner_states.length > 0);
  assert.ok(Array.isArray(json.agent_interventions));

  const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logoutResponse.status, 204);
  const afterLogout = await fetch(`${baseUrl}/submit/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ task_id: 1, stage: "C", code: "print('x')" }),
  });
  assert.equal(afterLogout.status, 401);

  console.log("Unified map API validation passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await deleteStudentsByIds([studentId]); } catch (error) { console.error("QA cleanup failed:", error); }
    await pool.end();
  });
