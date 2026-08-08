import type { ExecutionResult, Stage } from "../types";

const diagnosisLabels: Record<string, string> = {
  blocks_to_python_syntax_transfer: "检查 Python 语法",
  transfer_wrong_nesting: "检查缩进和嵌套",
  transfer_wrong_order: "检查语句顺序",
  invalid_structure: "检查积木连接",
  syntax_error: "检查语法",
  python_syntax_error: "检查括号、引号或缩进",
  runtime_error: "检查运行错误",
  target_mismatch: "检查任务目标",
  logic_target_mismatch: "检查程序与任务目标",
};

export function executionAnchor(stage: Stage, result: ExecutionResult) {
  const diagnostic = result.learning_diagnostics?.find((item) => !item.resolved);
  const blockId = diagnostic?.block_id || result.diagnostics.find((item) => item.block_id)?.block_id;
  const line = diagnostic?.line || result.line || undefined;
  if (!blockId && !line) return null;
  const code = diagnostic?.code || result.status;
  const reason = diagnosisLabels[code]
    || (code.startsWith("block_") ? "检查积木连接或输入" : "检查这里");
  return {
    stage,
    block_id: blockId,
    line,
    label: line ? `检查第${line}行：${reason}` : reason,
  };
}
