// Block type ID → English name + color category mapping
// Used to communicate with LLM in student-friendly language
export const blockNameMap: Record<string, { name: string; color: string }> = {
  controls_if:            { name: "if/else", color: "Blue-Control" },
  controls_repeat_ext:    { name: "repeat N times", color: "Blue-Control" },
  controls_whileUntil:    { name: "while loop", color: "Blue-Control" },
  variables_set:          { name: "set variable", color: "Orange-Data" },
  variables_get:          { name: "get variable", color: "Orange-Data" },
  math_number:            { name: "number", color: "Orange-Data" },
  math_arithmetic:        { name: "arithmetic", color: "Orange-Data" },
  logic_compare:          { name: "comparison", color: "Orange-Data" },
  logic_operation:        { name: "and/or", color: "Orange-Data" },
  logic_negate:           { name: "not", color: "Orange-Data" },
  math_random_int:        { name: "random integer", color: "Orange-Data" },
  sensing_ask:            { name: "ask and wait", color: "Green-I/O" },
  text_print:             { name: "print", color: "Green-I/O" },
  text:                   { name: "text content", color: "Purple-Text" },
  text_join:              { name: "text join", color: "Purple-Text" },
  text_length:            { name: "string length", color: "Purple-Text" },
};

export function blockIdToName(id: string): string {
  const info = blockNameMap[id];
  return info ? `${info.name} (${info.color})` : id;
}
