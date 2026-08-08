const knowledgeLabels: Record<string, string> = {
  sequence_execution: "顺序执行",
  sequential_execution: "顺序执行",
  print_text: "输出语句与文本",
  block_connection: "积木连接",
  variable_assignment: "变量赋值",
  variable_read: "变量读取",
  variable_reading: "变量读取",
  arithmetic_add_subtract: "加减运算",
  arithmetic: "加减运算",
  input_string: "输入",
  input: "输入",
  text_comparison: "文本比较",
  if_else: "条件分支",
  for_range: "循环次数",
  indentation: "Python缩进",
  structure_nesting: "结构嵌套",
  coordinate_xy: "二维坐标",
  coordinates: "二维坐标",
  blocks_to_python_transfer: "积木到Python迁移",
  block_to_python: "积木到Python迁移",
  python_syntax: "Python语法",
};

const diagnosisLabels: Record<string, string> = {
  empty_workspace: "积木工作区为空",
  block_missing_input: "积木缺少必要输入",
  missing_input: "积木缺少必要输入",
  disconnected_block: "积木没有正确连接",
  floating_block: "存在游离积木",
  floating_blocks: "存在游离积木",
  empty_statement: "控制结构内部缺少内容",
  invalid_variable: "变量名称不符合Python规则",
  wrong_order: "语句顺序与任务目标不一致",
  syntax_error: "Python语法有误",
  runtime_error: "程序运行中出错",
  target_mismatch: "运行结果与任务目标不一致",
  logic_target_mismatch: "程序可以运行，但结果未达到任务目标",
  transfer_missing_statement: "从积木转写到Python时遗漏了语句",
  transfer_order_mismatch: "Python语句顺序与积木不一致",
  transfer_nesting_mismatch: "积木到Python转写时嵌套或缩进不一致",
  transfer_structure_mismatch: "条件或循环结构的转写不一致",
};

export function readableKnowledgeComponent(value: unknown) {
  const key = String(value || "").trim();
  if (/[一-鿿]/.test(key) && !key.includes("_")) return key;
  return knowledgeLabels[key] || "相关编程知识";
}

export function readableDiagnosis(value: unknown) {
  const key = String(value || "").trim();
  if (/[一-鿿]/.test(key) && !key.includes("_")) return key;
  const normalized = key.startsWith("block_") ? key.slice("block_".length) : key;
  return diagnosisLabels[key] || diagnosisLabels[normalized] || "需要结合学生作品继续观察";
}

export function replaceInternalTerms(value: unknown) {
  let text = String(value || "");
  const replacements = { ...knowledgeLabels, ...diagnosisLabels };
  for (const [key, label] of Object.entries(replacements).sort((a, b) => b[0].length - a[0].length)) {
    text = text.replace(new RegExp(`\\b${key}\\b`, "g"), label);
  }
  return text.replace(/\s+/g, " ").trim();
}

export function containsInternalTerms(value: unknown) {
  const text = String(value || "");
  return /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/i.test(text)
    || /(?:snapshot|artifact|request|prompt|session)[ _-]?(?:id|hash|version)/i.test(text)
    || /<xml\b|\{\s*"(?:result|diagnostics|blockly_xml)"/i.test(text);
}

export function sanitizeTeacherText(value: unknown, maxLength = 160) {
  return replaceInternalTerms(value)
    .replace(/([。！？；，])\1+/g, "$1")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeTeacherAdviceContent(content: any) {
  return {
    strengths: Array.isArray(content?.strengths)
      ? content.strengths.slice(0, 2).map((item: unknown) => sanitizeTeacherText(item, 120)).filter(Boolean)
      : [],
    difficulty: sanitizeTeacherText(content?.difficulty || "当前证据不足。", 120),
    transfer: sanitizeTeacherText(content?.transfer || "当前证据不足。", 120),
    support: sanitizeTeacherText(content?.support || "当前证据不足。", 120),
    next_step: sanitizeTeacherText(content?.next_step || "继续收集学生的独立尝试证据。", 120),
  };
}

export function sanitizeLearningSummaryRecord(summary: any) {
  if (!summary?.content) return summary;
  return {
    ...summary,
    content: {
      ...summary.content,
      sentences: Array.isArray(summary.content.sentences)
        ? summary.content.sentences.map((item: unknown) => sanitizeTeacherText(item, 120))
        : [],
      strengths: Array.isArray(summary.content.strengths)
        ? summary.content.strengths.map((item: unknown) => sanitizeTeacherText(item, 100))
        : [],
      difficulties: Array.isArray(summary.content.difficulties)
        ? summary.content.difficulties.map((item: unknown) => sanitizeTeacherText(item, 100))
        : [],
      support_use: sanitizeTeacherText(summary.content.support_use, 120),
      revision_response: sanitizeTeacherText(summary.content.revision_response, 120),
      next_support: sanitizeTeacherText(summary.content.next_support, 120),
      knowledge_components: Array.isArray(summary.content.knowledge_components)
        ? summary.content.knowledge_components.map(readableKnowledgeComponent)
        : [],
    },
  };
}
