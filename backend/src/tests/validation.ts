import assert from "node:assert/strict";
import { curriculumTasks, CURRICULUM_VERSION, PROMPT_VERSION } from "../tasks/curriculum";
import { generatePythonFromBlockly } from "../services/blocklyPython";
import { runPython, stageTargetMet } from "../services/pythonRunner";
import {
  buildChatSystemPrompt,
  getReplyCharacterLimit,
  replyContradictsStudentCode,
  trimAssistantReply,
} from "../services/chatPolicy";
import {
  buildRunSnapshot,
  buildWorkspaceSnapshot,
} from "../services/learningContext";
import { componentsForTask, componentsForPython } from "../services/knowledgeComponents";
import {
  diagnoseAttempt,
  mismatchComponents,
} from "../services/diagnosticEngine";
import { supportLevelFor, supportLevelForRunFeedback } from "../services/interventionPolicy";
import { analyzePythonStructure } from "../services/transferAnalysis";
import { chatOperationId, currentOutputMismatchHint, successfulRunReply } from "../routes/chat";
import { selectSupportStrategy } from "../services/learningProfiles";
import { buildIDialogueFallback } from "../services/iDialogueState";

function normalized(code: string) {
  return code
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function runTask(taskId: number, input = "") {
  const task = curriculumTasks.find((item) => item.id === taskId)!;
  const content = task.content_json as any;
  const generated = generatePythonFromBlockly(content.c_stage.blocks_xml);
  assert.equal(generated.valid, true, `任务${taskId}的C积木必须有效`);
  assert.equal(
    normalized(generated.code),
    normalized(content.a_stage.python_code),
    `任务${taskId}的A代码与C积木生成代码必须一致`
  );
  const run = await runPython(content.a_stage.python_code, input, 5000, content.visualization);
  return { content, generated, run };
}

async function main() {
  assert.notEqual(
    chatOperationId({
      trigger: "student_message",
      request_key: "same-artifact-key",
      client_message_id: "student-message-1",
    }),
    chatOperationId({
      trigger: "student_message",
      request_key: "same-artifact-key",
      client_message_id: "student-message-2",
    })
  );
  assert.equal(
    chatOperationId({ trigger: "student_message", client_message_id: "retry-message" }),
    chatOperationId({ trigger: "student_message", client_message_id: "retry-message" })
  );
  assert.equal(
    chatOperationId({
      trigger: "hint_request",
      request_key: "stable-system-request",
      client_message_id: "ignored-message-id",
    }),
    "stable-system-request"
  );
  assert.equal(CURRICULUM_VERSION, "experiment-v2.8.1-student-flow-fixes");
  assert.equal(PROMPT_VERSION, "icap-multilevel-profile-agent-v5");
  assert.equal(curriculumTasks.length, 6);
  const persistentState = {
    knowledge_component: "if_else",
    state: "needs_support" as const,
    success_count: 0,
    error_count: 3,
    independent_success_count: 0,
  };
  assert.equal(selectSupportStrategy({
    stage: "P",
    diagnostics: [],
    learnerStates: [persistentState],
    taskProfile: null,
    courseProfile: null,
  }).interaction_mode, "explain");
  const cStrategy = selectSupportStrategy({
    stage: "C",
    diagnostics: [{ knowledge_components: ["indentation"], severity: "blocking" }],
    learnerStates: [persistentState],
    taskProfile: null,
    courseProfile: null,
  });
  assert.equal(cStrategy.interaction_mode, "coach");
  assert.equal(cStrategy.support_level, 2);
  assert.equal(supportLevelForRunFeedback("A", 2), 1);
  assert.equal(supportLevelForRunFeedback("A", 3), 2);
  assert.equal(supportLevelForRunFeedback("A", 4), 3);
  assert.equal(supportLevelForRunFeedback("C", 2), 2);
  assert.equal(supportLevelForRunFeedback("C", 3), 3);
  const profileDrivenStrategy = selectSupportStrategy({
    stage: "I",
    diagnostics: [],
    learnerStates: [],
    taskProfile: {
      summary_id: "task-summary",
      scope: "task",
      task_id: 2,
      version: 1,
      evidence_hash: "task-profile",
      evidence_ids: ["task-evidence"],
      content: {
        sentences: [], strengths: [], difficulties: ["variable_read"],
        support_use: "", revision_response: "", next_support: "",
        knowledge_components: ["variable_read"],
      },
      is_stale: false,
      created_at: new Date().toISOString(),
    },
    courseProfile: {
      summary_id: "course-summary",
      scope: "course",
      version: 1,
      evidence_hash: "course-profile",
      evidence_ids: ["course-evidence"],
      content: {
        sentences: [], strengths: [], difficulties: ["if_else"],
        support_use: "", revision_response: "", next_support: "",
        knowledge_components: ["if_else"],
      },
      is_stale: false,
      created_at: new Date().toISOString(),
    },
  });
  assert.equal(profileDrivenStrategy.primary_focus, "变量读取");
  assert.equal(profileDrivenStrategy.secondary_focus, "条件分支");
  assert.deepEqual(profileDrivenStrategy.evidence_ids, ["task-evidence", "course-evidence"]);
  assert.match(buildIDialogueFallback({
    phase: "challenge",
    focus: ["条件判断"],
    discussed_topics: [],
    resolved_topics: [],
    student_decisions: [],
    turn_count: 2,
  }, true), /运行一次验证/);
  assert.deepEqual(
    mismatchComponents(5, "x = 0\nfor i in range(4):\n    if x < 1:\n        x = x + 1"),
    ["text_comparison"]
  );
  assert.deepEqual(mismatchComponents(4, "for i in range(1):\n    x = x + 2"), ["for_range"]);
  assert.deepEqual(mismatchComponents(6, "x = 0\ny = 0"), ["input_string"]);

  const firstSuccessReply = successfulRunReply({
    latest_run: { evidence_id: "run-success" },
    recent_attempts: [
      { evidence_id: "run-success", stage: "C", result: "target_met" },
      { evidence_id: "a-failure", stage: "A", result: "invalid_structure" },
    ],
  }, "C");
  assert.doesNotMatch(firstSuccessReply, /此前的问题/);

  const recoveredSuccessReply = successfulRunReply({
    latest_run: { evidence_id: "run-success" },
    recent_attempts: [
      { evidence_id: "run-success", stage: "C", result: "target_met" },
      { evidence_id: "c-failure", stage: "C", result: "syntax_error" },
    ],
  }, "C");
  assert.match(recoveredSuccessReply, /学习小结/);
  assert.doesNotMatch(recoveredSuccessReply, /此前的问题|第\d+次/);

  for (const task of curriculumTasks) {
    const content = task.content_json as any;
    assert.deepEqual(content.a_stage.target, content.c_stage.target);
    assert.equal(content.i_stage.code_skeleton, "");
    assert.equal(content.visualization.type, "variable_map");
    assert.ok(["hidden", "full", "compact"].includes(content.visualization.coordinate_help));
    assert.ok(["none", "single", "stacked"].includes(content.visualization.collection_help));
    assert.ok(content.i_stage.ui_copy?.planning);
    assert.ok(content.i_stage.ui_copy?.discussion_step);
    assert.ok(content.learning_guide?.goal);
    assert.ok(content.learning_guide?.expected_effect);
    assert.ok(content.learning_guide?.steps.length >= 3);
    assert.ok(content.learning_guide?.observe);
    assert.ok(content.p_stage?.subtasks.length >= 3);
    for (const subtask of content.p_stage.subtasks) {
      assert.ok(subtask.objective);
      assert.ok(subtask.blocks.length > 0);
      for (const block of subtask.blocks) {
        assert.ok(block.drawer_category);
        assert.ok(block.meaning);
        assert.ok(block.translation_rule);
        assert.ok(block.python_code);
        assert.equal(/^(x、y|改变x或y|if \.\.\. else \.\.\.|input\(\) \+ if-else)$/.test(block.python_code), false);
      }
    }
    assert.equal(content.toolbox.some((type: string) => type.startsWith("stage_")), false);
    assert.equal(/move_|pick\(|say\(|pay\(|equip\(|place_/.test(content.a_stage.python_code), false);
  }

  const t1 = await runTask(1);
  assert.equal(t1.run.stdout, "大家好，我是小明\n我正在学习Python\n程序会按顺序执行\n");
  assert.equal((t1.run.stage_state as any).speech, "程序会按顺序执行");
  assert.equal((t1.content as any).visualization.coordinate_help, "hidden");
  assert.equal((t1.content as any).visualization.collection_help, "none");
  assert.equal(
    t1.run.events.some((event) => event.type === "stage" && ["move", "observe", "collect"].includes(event.action || "")),
    false
  );
  assert.equal(/路线|苹果|剩余/.test((t1.content as any).i_stage.ui_copy.discussion_step), false);

  const t2 = await runTask(2);
  assert.deepEqual((t2.run.stage_state as any).collected, ["right"]);
  assert.equal(t2.run.variables?.x, 2);
  assert.equal((t2.content as any).visualization.coordinate_help, "full");
  assert.match((t2.content as any).learning_guide.platform_principle.description, /Python只负责改变x、y/);
  const task2Move = t2.run.events.find(
    (event) => event.type === "stage"
      && ["move", "collect"].includes(event.action || "")
      && event.payload?.authoritative !== false
      && event.payload?.to_x === 2
  );
  assert.ok(task2Move, "任务2应生成真实坐标变化事件");
  assert.equal(task2Move?.line, 4);
  assert.equal(task2Move?.payload?.from_x, 0);
  assert.equal(task2Move?.payload?.delta_x, 2);
  assert.ok(t2.run.events.some((event) => event.type === "stage" && event.action === "collect"));

  const t3Apple = await runTask(3, "苹果");
  const t3Pear = await runTask(3, "梨");
  const t3Invalid = await runTask(3, "随便输入");
  assert.equal((t3Apple.content as any).visualization.collection_target, 1);
  assert.equal((t3Apple.content as any).i_stage.visualization_override.collection_target, 1);
  assert.equal((t3Apple.content as any).visualization.objects.length, 2);
  assert.deepEqual((t3Apple.run.stage_state as any).collected, ["apple-right"]);
  assert.deepEqual((t3Pear.run.stage_state as any).collected, ["pear-down"]);
  assert.equal((t3Pear.run.stage_state as any).objects.find((item: any) => item.id === "pear-down").kind, "pear");
  assert.equal(
    stageTargetMet(
      (t3Invalid.content as any).a_stage.target,
      "随便输入",
      t3Invalid.run.stage_state,
      t3Invalid.run.variables,
      t3Invalid.run.ast_features,
      t3Invalid.run.stdout
    ),
    false
  );
  assert.equal(
    stageTargetMet(
      (t3Apple.content as any).i_stage.target,
      "苹果",
      t3Apple.run.stage_state,
      t3Apple.run.variables,
      t3Apple.run.ast_features,
      "找到苹果\n"
    ),
    true
  );
  assert.equal(
    stageTargetMet(
      (t3Apple.content as any).i_stage.target,
      "苹果",
      t3Apple.run.stage_state,
      t3Apple.run.variables,
      t3Apple.run.ast_features,
      ""
    ),
    false
  );

  const t4 = await runTask(4);
  assert.deepEqual((t4.run.stage_state as any).collected, ["right-1", "right-2"]);
  assert.equal(t4.run.variables?.x, 0);
  assert.equal((t4.content as any).visualization.collection_help, "stacked");

  const t5 = await runTask(5);
  assert.deepEqual((t5.run.stage_state as any).collected, ["a1", "a2", "a3", "a4"]);
  assert.equal((t5.content as any).learning_guide.trace.rows.length, 4);
  assert.equal((t5.content as any).visualization.state_panel.trace.rows.length, 4);
  assert.equal(t5.generated.code.includes("%"), false);
  assert.match(t5.generated.code, /if \(?x < 2\)?:/);

  const t6Apple = await runTask(6, "苹果");
  const t6Pear = await runTask(6, "梨");
  assert.deepEqual((t6Apple.run.stage_state as any).collected, ["apple-right", "pear-down"]);
  assert.deepEqual((t6Pear.run.stage_state as any).collected, ["pear-down", "apple-right"]);
  assert.equal(t6Apple.run.ast_features?.has_for, true);
  assert.equal(t6Apple.run.ast_features?.has_if, true);
  assert.equal((t6Apple.content as any).learning_guide.program_sections.length, 4);

  for (const taskId of [3, 4, 5, 6]) {
    assert.equal(
      (curriculumTasks.find((item) => item.id === taskId)!.content_json as any).visualization.coordinate_help,
      "compact"
    );
  }

  const t6Guide = (t6Apple.content as any).learning_guide;
  const t6Prompt = buildChatSystemPrompt({
    stage: "A",
    taskTitle: "二维综合任务",
    taskDescription: curriculumTasks[5].description,
    stageContext: [
      `本任务明确目标：${t6Guide.goal}`,
      `本任务操作步骤：${t6Guide.steps.join("；")}`,
      `本任务限定知识点：${t6Guide.concepts.join("、")}`,
    ].join("\n"),
    trigger: "stage_intro",
    attempt: 0,
    promptVersion: PROMPT_VERSION,
  });
  assert.match(t6Prompt, /本任务限定知识点：变量、input\(\)、if-else、for循环、二维坐标/);
  assert.match(t6Prompt, /不得误说成print\(\)或输出积木/);

  const pPrompt = buildChatSystemPrompt({
    stage: "P",
    taskTitle: "变量与坐标",
    taskDescription: curriculumTasks[1].description,
    stageContext: "讲解x、y与平台地图的关系",
    trustedTaskFacts: "平台规则：Python只改变变量，平台负责显示移动",
    trigger: "stage_intro",
    attempt: 0,
    promptVersion: PROMPT_VERSION,
  });
  assert.match(pPrompt, /不得主动给出本题目标数值/);
  assert.match(pPrompt, /平台负责/);

  const multilinePrompt = buildChatSystemPrompt({
    stage: "I",
    taskTitle: "顺序执行与输出",
    taskDescription: "编写多行输出语句",
    trigger: "run_feedback",
    attempt: 1,
    studentCode: [
      'print("大家好我是小明")',
      'print("我正在学习Python")',
      'print("程序会按顺序执行")',
    ].join("\n"),
    promptVersion: PROMPT_VERSION,
  });
  assert.match(multilinePrompt, /学生当前代码非空行数：3/);
  assert.match(multilinePrompt, /1 \| print\("大家好我是小明"\)/);
  assert.match(multilinePrompt, /3 \| print\("程序会按顺序执行"\)/);
  assert.match(multilinePrompt, /回复长度要求：不超过140个汉字和标点/);
  assert.equal(getReplyCharacterLimit("stage_intro", "P"), 100);
  assert.equal(getReplyCharacterLimit("p_step_explanation", "P"), 120);
  assert.equal(getReplyCharacterLimit("hint_request", "C", 3), 200);
  const longReply = `${"请检查当前积木的连接位置，".repeat(12)}然后再运行。`;
  const trimmedReply = trimAssistantReply(longReply, 90);
  assert.ok(Array.from(trimmedReply).length <= 90);
  assert.match(trimmedReply, /[。！？；…]$/);
  assert.equal(
    replyContradictsStudentCode("你目前只写了一条输出语句。", 'print("a")\nprint("b")\nprint("c")'),
    true
  );
  assert.equal(
    replyContradictsStudentCode("我读取到了三条输出语句。", 'print("a")\nprint("b")\nprint("c")'),
    false
  );
  assert.equal(
    replyContradictsStudentCode("你当前编辑器里有1行print语句。", 'print("a")\nprint("b")'),
    true
  );
  assert.equal(
    replyContradictsStudentCode("你当前编辑器里有2行print语句。", 'print("a")\nprint("b")'),
    false
  );
  assert.equal(
    replyContradictsStudentCode("第2条和第3条里面是空的（显示None）。", 'print("a")\nprint("b")\nprint("c")'),
    true
  );
  assert.equal(
    replyContradictsStudentCode("第3条输出积木为空。", 'print("a")\nprint("b")\nprint("")'),
    false
  );
  assert.equal(
    replyContradictsStudentCode("第2条输出积木为空。", 'print("a")\nprint("b")\nprint("")'),
    true
  );

  const aWorkspaceSnapshot = buildWorkspaceSnapshot({
    stage: "A",
    blocklyXml: (t1.content as any).c_stage.blocks_xml,
  });
  assert.equal(
    normalized(aWorkspaceSnapshot.currentCode),
    normalized((t1.content as any).a_stage.python_code)
  );
  assert.match(aWorkspaceSnapshot.context, /当前积木实际生成的Python/);
  assert.match(aWorkspaceSnapshot.context, /当前积木结构化事实/);
  assert.match(aWorkspaceSnapshot.context, /下方已连接下一条积木/);
  assert.match(aWorkspaceSnapshot.context, /积木ID=/);

  const staleRunSnapshot = buildRunSnapshot(
    {
      generated_code: 'print("旧内容")',
      result: "target_met",
      stdout: "不应提供给当前回答的旧输出",
    },
    'print("新内容")'
  );
  assert.equal(staleRunSnapshot.hasRun, true);
  assert.equal(staleRunSnapshot.matchesCurrent, false);
  assert.match(staleRunSnapshot.facts, /尚未运行/);
  assert.doesNotMatch(staleRunSnapshot.facts, /不应提供给当前回答的旧输出/);

  const matchingRunSnapshot = buildRunSnapshot(
    {
      generated_code: 'print("新内容")',
      result: "target_met",
      input: "",
      stdout: "新内容\n",
      stderr: "",
      events: [],
    },
    'print("新内容")'
  );
  assert.equal(matchingRunSnapshot.matchesCurrent, true);
  assert.match(matchingRunSnapshot.facts, /标准输出stdout=新内容/);

  const groundedPrompt = buildChatSystemPrompt({
    stage: "A",
    taskTitle: "顺序执行与输出",
    taskDescription: curriculumTasks[0].description,
    trigger: "student_message",
    attempt: 1,
    studentCode: aWorkspaceSnapshot.currentCode,
    workspaceContext: aWorkspaceSnapshot.context,
    runFacts: staleRunSnapshot.facts,
    promptVersion: PROMPT_VERSION,
  });
  assert.match(groundedPrompt, /当前积木实际生成的Python/);
  assert.match(groundedPrompt, /当前内容状态=尚未运行/);

  assert.match(currentOutputMismatchHint({ latest_run: {
    matches_current_artifact: true,
    stdout: "第一句\n第二句\n写错了\n",
    expected_output: "第一句\n第二句\n第三句\n",
  } }), /第3条输出内容/);

  const noSpawnCollection = await runPython(
    "x = 0\ny = 0",
    "",
    5000,
    {
      type: "variable_map",
      width: 5,
      height: 5,
      actor: { x: 0, y: 0 },
      coordinate_bounds: { min_x: -2, max_x: 2, min_y: -2, max_y: 2 },
      objects: [{ id: "spawn", kind: "apple", x: 0, y: 0 }],
    }
  );
  assert.deepEqual((noSpawnCollection.stage_state as any).collected, []);

  const noInterpolationCollection = await runPython(
    "x = 0\ny = 0\nx = 2",
    "",
    5000,
    {
      type: "variable_map",
      width: 5,
      height: 5,
      actor: { x: 0, y: 0 },
      coordinate_bounds: { min_x: -2, max_x: 2, min_y: -2, max_y: 2 },
      objects: [
        { id: "middle", kind: "apple", x: 1, y: 0 },
        { id: "end", kind: "apple", x: 2, y: 0 },
      ],
    }
  );
  assert.deepEqual((noInterpolationCollection.stage_state as any).collected, ["end"]);

  const duplicateAssignment = await runPython(
    "x = 0\ny = 0\nx = 2\nx = 2\nx = 0\nx = 2",
    "",
    5000,
    {
      type: "variable_map",
      width: 5,
      height: 5,
      actor: { x: 0, y: 0 },
      coordinate_bounds: { min_x: -2, max_x: 2, min_y: -2, max_y: 2 },
      objects: [
        { id: "one", kind: "apple", x: 2, y: 0 },
        { id: "two", kind: "apple", x: 2, y: 0 },
      ],
    }
  );
  assert.deepEqual((duplicateAssignment.stage_state as any).collected, ["one", "two"]);

  const outOfBounds = await runPython(
    "x = 0\ny = 0\nx = 4",
    "",
    5000,
    {
      type: "variable_map",
      width: 5,
      height: 5,
      actor: { x: 0, y: 0 },
      coordinate_bounds: { min_x: -2, max_x: 2, min_y: -2, max_y: 2 },
      objects: [],
    }
  );
  assert.equal((outOfBounds.stage_state as any).actor.x, 4);
  assert.equal((outOfBounds.stage_state as any).actor.display_x, 2);
  assert.equal((outOfBounds.stage_state as any).out_of_bounds, true);

  const t6Target = (t6Apple.content as any).a_stage.target;
  assert.equal(
    stageTargetMet(
      t6Target,
      "苹果",
      t6Apple.run.stage_state,
      t6Apple.run.variables,
      t6Apple.run.ast_features
    ),
    true
  );

  assert.ok(componentsForTask(6).includes("blocks_to_python_transfer"));
  assert.deepEqual(
    componentsForPython("x = x + 1\nif x < 2:\n    print(x)").sort(),
    [
      "arithmetic_add_subtract",
      "coordinate_xy",
      "if_else",
      "indentation",
      "print_text",
      "text_comparison",
      "variable_assignment",
      "variable_read",
    ].sort()
  );
  const structureDiagnostics = await diagnoseAttempt({
    userId: "validation",
    taskId: 3,
    stage: "A",
    status: "invalid_structure",
    evidenceId: "snapshot-1",
    code: "",
    blockDiagnostics: [{ code: "missing_input", block_id: "block-1" }],
  });
  assert.equal(structureDiagnostics[0].code, "block_missing_input");
  assert.equal(structureDiagnostics[0].block_id, "block-1");
  assert.equal(supportLevelFor(structureDiagnostics, 0), 2);
  assert.equal(supportLevelFor(structureDiagnostics, 2), 3);
  const successDiagnostics = await diagnoseAttempt({
    userId: "validation",
    taskId: 1,
    stage: "A",
    status: "target_met",
    evidenceId: "snapshot-2",
    code: "print('ok')",
  });
  assert.ok(successDiagnostics.every((item) => item.resolved));

  const parsedStructure = await analyzePythonStructure(
    "x = 0\nfor i in range(2):\n    if x < 2:\n        x = x + 1"
  );
  assert.equal(parsedStructure.valid, true);
  assert.deepEqual(parsedStructure.statements.map((item) => item.type), ["assign", "for", "if", "assign"]);
  assert.deepEqual(parsedStructure.statements.map((item) => item.depth), [0, 0, 1, 2]);
  const invalidStructure = await analyzePythonStructure("if x < 2\n    x = 1");
  assert.equal(invalidStructure.valid, false);
  assert.equal(invalidStructure.error?.line, 1);

  console.log("Unified map and process-aware agent validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
