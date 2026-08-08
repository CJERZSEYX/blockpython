export const KNOWLEDGE_COMPONENTS = [
  "sequence_execution",
  "print_text",
  "block_connection",
  "variable_assignment",
  "variable_read",
  "arithmetic_add_subtract",
  "input_string",
  "text_comparison",
  "if_else",
  "for_range",
  "indentation",
  "structure_nesting",
  "coordinate_xy",
  "blocks_to_python_transfer",
] as const;

export type KnowledgeComponent = typeof KNOWLEDGE_COMPONENTS[number];

const TASK_COMPONENTS: Record<number, KnowledgeComponent[]> = {
  1: ["sequence_execution", "print_text", "block_connection", "blocks_to_python_transfer"],
  2: ["variable_assignment", "variable_read", "arithmetic_add_subtract", "coordinate_xy", "blocks_to_python_transfer"],
  3: ["variable_assignment", "input_string", "text_comparison", "if_else", "structure_nesting", "coordinate_xy", "blocks_to_python_transfer"],
  4: ["variable_assignment", "variable_read", "arithmetic_add_subtract", "for_range", "indentation", "structure_nesting", "coordinate_xy", "blocks_to_python_transfer"],
  5: ["variable_assignment", "variable_read", "arithmetic_add_subtract", "text_comparison", "if_else", "for_range", "indentation", "structure_nesting", "coordinate_xy", "blocks_to_python_transfer"],
  6: ["variable_assignment", "variable_read", "arithmetic_add_subtract", "input_string", "text_comparison", "if_else", "for_range", "indentation", "structure_nesting", "coordinate_xy", "blocks_to_python_transfer"],
};

export function componentsForTask(taskId: number): KnowledgeComponent[] {
  return TASK_COMPONENTS[taskId] || [];
}

export function componentsForBlockTypes(blockTypes: string[]): KnowledgeComponent[] {
  const result = new Set<KnowledgeComponent>();
  for (const type of blockTypes) {
    if (type === "text_print" || type === "text") result.add("print_text");
    if (type === "variables_set") result.add("variable_assignment");
    if (type === "variables_get") result.add("variable_read");
    if (type === "math_arithmetic") result.add("arithmetic_add_subtract");
    if (type === "sensing_ask") result.add("input_string");
    if (type === "logic_compare") result.add("text_comparison");
    if (type === "controls_if") result.add("if_else");
    if (type === "controls_repeat_ext") result.add("for_range");
  }
  return [...result];
}

export function componentsForPython(code: string): KnowledgeComponent[] {
  const result = new Set<KnowledgeComponent>();
  if (/\bprint\s*\(/.test(code)) result.add("print_text");
  if (/^[ \t]*[A-Za-z_]\w*[ \t]*=/m.test(code)) result.add("variable_assignment");
  if (/[A-Za-z_]\w*[ \t]*=[^\n]*[A-Za-z_]\w*/.test(code)) result.add("variable_read");
  if (/[+\-]/.test(code)) result.add("arithmetic_add_subtract");
  if (/\binput\s*\(/.test(code)) result.add("input_string");
  if (/==|!=|<=|>=|<|>/.test(code)) result.add("text_comparison");
  if (/^[ \t]*if\b/m.test(code)) result.add("if_else");
  if (/^[ \t]*for\b[^\n]*\brange\s*\(/m.test(code)) result.add("for_range");
  if (/\n[ \t]+\S/.test(code)) result.add("indentation");
  if (/^[ \t]+(?:if|for)\b/m.test(code)) result.add("structure_nesting");
  if (/\b[xy]\b/.test(code)) result.add("coordinate_xy");
  return [...result];
}
