import pool from "../config/database";
import { componentsForBlockTypes, componentsForPython, componentsForTask } from "./knowledgeComponents";
import type { DiagnosticResult, LearningStage } from "./agentTypes";

interface AttemptDiagnosisInput {
  userId: string;
  taskId: number;
  stage: LearningStage;
  status: string;
  evidenceId: string;
  code: string;
  blockTypes?: string[];
  blockDiagnostics?: Array<{ code: string; block_id?: string }>;
  errorLine?: number | null;
  stderr?: string;
}

const componentForBlockDiagnostic: Record<string, string[]> = {
  floating_blocks: ["block_connection"],
  missing_input: ["block_connection"],
  empty_statement: ["structure_nesting"],
  unsupported_block: ["block_connection"],
  invalid_variable: ["variable_assignment"],
  empty_workspace: ["block_connection"],
};

function syntaxComponents(stderr: string): string[] {
  if (/indent|缩进/i.test(stderr)) return ["indentation", "blocks_to_python_transfer"];
  if (/expected.*block|冒号|colon/i.test(stderr)) return ["structure_nesting", "blocks_to_python_transfer"];
  return ["blocks_to_python_transfer"];
}

const DEFAULT_MISMATCH_COMPONENTS: Record<number, string[]> = {
  1: ["sequence_execution", "print_text"],
  2: ["arithmetic_add_subtract", "coordinate_xy"],
  3: ["text_comparison"],
  4: ["for_range"],
  5: ["text_comparison"],
  6: ["coordinate_xy"],
};

export function defaultMismatchComponents(taskId: number): string[] {
  return DEFAULT_MISMATCH_COMPONENTS[taskId] || ["blocks_to_python_transfer"];
}

export function mismatchComponents(taskId: number, code: string): string[] {
  const hasLoop = /^[ \t]*for\b[^\n]*\brange\s*\(/m.test(code);
  const hasCondition = /^[ \t]*if\b/m.test(code);
  const hasInput = /\binput\s*\(/.test(code);

  if (taskId === 1 || taskId === 2) return defaultMismatchComponents(taskId);
  if (taskId === 3) {
    if (!hasInput) return ["input_string"];
    if (!hasCondition) return ["if_else"];
    return ["text_comparison"];
  }
  if (taskId === 4) return defaultMismatchComponents(taskId);
  if (taskId === 5) {
    if (!hasLoop) return ["for_range"];
    if (!hasCondition) return ["if_else"];
    return ["text_comparison"];
  }
  if (taskId === 6) {
    if (!hasInput) return ["input_string"];
    if (!hasCondition) return ["if_else"];
    if (!hasLoop) return ["for_range"];
    return ["coordinate_xy"];
  }
  return defaultMismatchComponents(taskId);
}

export async function diagnoseAttempt(input: AttemptDiagnosisInput): Promise<DiagnosticResult[]> {
  const evidence = [input.evidenceId];
  const diagnostics: DiagnosticResult[] = [];
  for (const item of input.blockDiagnostics || []) {
    diagnostics.push({
      code: `block_${item.code}`,
      knowledge_components: componentForBlockDiagnostic[item.code] || ["block_connection"],
      severity: "blocking",
      evidence_ids: evidence,
      block_id: item.block_id,
      resolved: false,
    });
  }
  if (diagnostics.length > 0) return diagnostics;

  const taskComponents = componentsForTask(input.taskId);
  const observed = input.stage === "A"
    ? componentsForBlockTypes(input.blockTypes || [])
    : componentsForPython(input.code);

  if (input.status === "syntax_error") {
    let code = "python_syntax_error";
    if (input.stage === "C") {
      const [rows] = await pool.query<any[]>(
        `SELECT id FROM user_actions
         WHERE user_id = ? AND task_id = ? AND stage = 'A' AND action_type = 'a_submit'
           AND JSON_UNQUOTE(JSON_EXTRACT(action_detail, '$.result')) = 'target_met'
         LIMIT 1`,
        [input.userId, input.taskId]
      );
      if (rows.length > 0) code = "blocks_to_python_syntax_transfer";
    }
    return [{
      code,
      knowledge_components: syntaxComponents(input.stderr || ""),
      severity: "blocking",
      evidence_ids: evidence,
      line: input.errorLine || undefined,
      resolved: false,
    }];
  }

  if (input.status === "runtime_error" || input.status === "timeout") {
    return [{
      code: input.status,
      knowledge_components: observed.length ? observed : taskComponents,
      severity: "blocking",
      evidence_ids: evidence,
      line: input.errorLine || undefined,
      resolved: false,
    }];
  }

  if (input.status === "target_mismatch") {
    return [{
      code: "logic_target_mismatch",
      knowledge_components: mismatchComponents(input.taskId, input.code),
      severity: "warning",
      evidence_ids: evidence,
      resolved: false,
    }];
  }

  if (input.status === "target_met") {
    return taskComponents.map((component) => ({
      code: `evidence_success_${component}`,
      knowledge_components: [component],
      severity: "info" as const,
      evidence_ids: evidence,
      resolved: true,
    }));
  }

  return [];
}
