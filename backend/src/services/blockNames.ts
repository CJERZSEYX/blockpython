// Block ID → English name mapping (injected into LLM System Prompt, not user-facing)
export const BLOCK_NAME_INDEX = `
Block Name Reference (LLM must use English names in replies, not raw IDs):
  controls_if = if/else block (Blue - Control)
  controls_repeat_ext = repeat N times block (Blue - Control)
  controls_whileUntil = while loop block (Blue - Control)
  variables_set = variable assignment block (Orange - Data)
  math_number = number block (Orange - Data)
  math_arithmetic = arithmetic block (Orange - Data)
  logic_compare = comparison block (Orange - Data)
  logic_operation = and/or block (Orange - Data)
  logic_negate = not block (Orange - Data)
  math_random_int = random integer block (Orange - Data)
  sensing_ask = ask and wait block (Green - I/O)
  text_print = print block (Green - I/O)
  text = text content block (Purple - Text)
  text_join = text join block (Purple - Text)
  text_length = string length block (Purple - Text)
`;
