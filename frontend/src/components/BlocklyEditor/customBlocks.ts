import * as Blockly from "blockly";

const COLORS = { control: "#4C97FF", data: "#FF8C1A", io: "#59C059", text: "#CF63CF" };

const blockDefs: Record<string, any> = {
  controls_if: { type: "controls_if", init(this: any) {
    this.jsonInit({ message0: "if %1 then %2 else %3", args0: [{ type: "input_value", name: "IF0", check: "Boolean" }, { type: "input_statement", name: "DO0" }, { type: "input_statement", name: "ELSE" }], colour: COLORS.control, previousStatement: null, nextStatement: null, });
  }},
  controls_repeat_ext: { type: "controls_repeat_ext", init(this: any) {
    this.jsonInit({ message0: "repeat %1 times %2", args0: [{ type: "input_value", name: "TIMES", check: "Number" }, { type: "input_statement", name: "DO" }], colour: COLORS.control, previousStatement: null, nextStatement: null, });
  }},
  controls_whileUntil: { type: "controls_whileUntil", init(this: any) {
    this.jsonInit({ message0: "while %1 %2", args0: [{ type: "input_value", name: "BOOL", check: "Boolean" }, { type: "input_statement", name: "DO" }], colour: COLORS.control, previousStatement: null, nextStatement: null, });
  }},
  variables_set: { type: "variables_set", init(this: any) {
    this.jsonInit({ message0: "set %1 to %2", args0: [{ type: "field_variable", name: "VAR" }, { type: "input_value", name: "VALUE" }], colour: COLORS.data, previousStatement: null, nextStatement: null, });
  }},
  math_number: { type: "math_number", init(this: any) {
    this.jsonInit({ message0: "%1", args0: [{ type: "field_number", name: "NUM", value: 0 }], colour: COLORS.data, output: "Number", });
  }},
  math_arithmetic: { type: "math_arithmetic", init(this: any) {
    this.jsonInit({ message0: "%1 %2 %3", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "field_dropdown", name: "OP", options: [["+","ADD"],["-","MINUS"],["x","MULTIPLY"],["/","DIVIDE"],["% mod","MODULO"]] }, { type: "input_value", name: "B", check: "Number" }], colour: COLORS.data, output: "Number", });
  }},
  logic_compare: { type: "logic_compare", init(this: any) {
    this.jsonInit({ message0: "%1 %2 %3", args0: [{ type: "input_value", name: "A" }, { type: "field_dropdown", name: "OP", options: [["=","EQ"],["!=","NEQ"],["<","LT"],["<=","LTE"],[">","GT"],[">=","GTE"]] }, { type: "input_value", name: "B" }], colour: COLORS.data, output: "Boolean", });
  }},
  logic_operation: { type: "logic_operation", init(this: any) {
    this.jsonInit({ message0: "%1 %2 %3", args0: [{ type: "input_value", name: "A", check: "Boolean" }, { type: "field_dropdown", name: "OP", options: [["and","AND"],["or","OR"]] }, { type: "input_value", name: "B", check: "Boolean" }], colour: COLORS.data, output: "Boolean", });
  }},
  logic_negate: { type: "logic_negate", init(this: any) {
    this.jsonInit({ message0: "not %1", args0: [{ type: "input_value", name: "BOOL", check: "Boolean" }], colour: COLORS.data, output: "Boolean", });
  }},
  text_print: { type: "text_print", init(this: any) {
    this.jsonInit({ message0: "print %1", args0: [{ type: "input_value", name: "TEXT" }], colour: COLORS.io, previousStatement: null, nextStatement: null, });
  }},
  sensing_ask: { type: "sensing_ask", init(this: any) {
    this.jsonInit({ message0: "ask %1 and wait", args0: [{ type: "input_value", name: "PROMPT", check: "String" }], colour: COLORS.io, output: "String", });
  }},
  text: { type: "text", init(this: any) {
    this.jsonInit({ message0: "%1", args0: [{ type: "field_input", name: "TEXT", text: "" }], colour: COLORS.text, output: "String", });
  }},
  text_join: { type: "text_join", init(this: any) {
    this.jsonInit({ message0: "join %1 and %2", args0: [{ type: "input_value", name: "A", check: "String" }, { type: "input_value", name: "B", check: "String" }], colour: COLORS.text, output: "String", });
  }},
  text_length: { type: "text_length", init(this: any) {
    this.jsonInit({ message0: "length of %1", args0: [{ type: "input_value", name: "VALUE", check: "String" }], colour: COLORS.text, output: "Number", });
  }},
  math_random_int: { type: "math_random_int", init(this: any) {
    this.jsonInit({ message0: "random int from %1 to %2", args0: [{ type: "input_value", name: "FROM", check: "Number" }, { type: "input_value", name: "TO", check: "Number" }], colour: COLORS.data, output: "Number", });
  }},
};

export const toolboxCategories = [
  { kind: "category", name: "🔷 Control", colour: COLORS.control, contents: [{ kind: "block", type: "controls_if" }, { kind: "block", type: "controls_repeat_ext" }, { kind: "block", type: "controls_whileUntil" }] },
  { kind: "category", name: "🔶 Data", colour: COLORS.data, contents: [{ kind: "block", type: "variables_set" }, { kind: "block", type: "math_number" }, { kind: "block", type: "math_arithmetic" }, { kind: "block", type: "logic_compare" }, { kind: "block", type: "logic_operation" }, { kind: "block", type: "logic_negate" }, { kind: "block", type: "math_random_int" }] },
  { kind: "category", name: "🟢 I/O", colour: COLORS.io, contents: [{ kind: "block", type: "sensing_ask" }, { kind: "block", type: "text_print" }] },
  { kind: "category", name: "🟣 Text", colour: COLORS.text, contents: [{ kind: "block", type: "text" }, { kind: "block", type: "text_join" }, { kind: "block", type: "text_length" }] },
];

export function registerCustomBlocks() {
  for (const [name, def] of Object.entries(blockDefs)) {
    Blockly.Blocks[name] = def;
  }
}
