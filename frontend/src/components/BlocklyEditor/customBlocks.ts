import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";

const COLORS = {
  control: "#4C97FF",
  data: "#FF8C1A",
  io: "#59C059",
  text: "#CF63CF",
};

const blockDefs: Record<string, { init(this: Blockly.Block): void }> = {
  controls_if: {
    init() {
      this.jsonInit({
        message0: "如果 %1 那么 %2 否则 %3",
        args0: [
          { type: "input_value", name: "IF0", check: ["Boolean", "Number"] },
          { type: "input_statement", name: "DO0" },
          { type: "input_statement", name: "ELSE" },
        ],
        colour: COLORS.control,
        previousStatement: null,
        nextStatement: null,
      });
    },
  },
  controls_repeat_ext: {
    init() {
      this.jsonInit({
        message0: "使用变量 %1 重复 %2 次 %3",
        args0: [
          { type: "field_variable", name: "VAR", variable: "i" },
          { type: "input_value", name: "TIMES", check: "Number" },
          { type: "input_statement", name: "DO" },
        ],
        colour: COLORS.control,
        previousStatement: null,
        nextStatement: null,
      });
    },
  },
  variables_set: {
    init() {
      this.jsonInit({
        message0: "将 %1 设为 %2",
        args0: [
          { type: "field_variable", name: "VAR", variable: "item" },
          { type: "input_value", name: "VALUE" },
        ],
        colour: COLORS.data,
        previousStatement: null,
        nextStatement: null,
      });
    },
  },
  variables_get: {
    init() {
      this.jsonInit({
        message0: "变量 %1",
        args0: [{ type: "field_variable", name: "VAR", variable: "item" }],
        colour: COLORS.data,
        output: null,
      });
    },
  },
  math_number: {
    init() {
      this.jsonInit({
        message0: "%1",
        args0: [{ type: "field_number", name: "NUM", value: 0 }],
        colour: COLORS.data,
        output: "Number",
      });
    },
  },
  math_arithmetic: {
    init() {
      this.jsonInit({
        message0: "%1 %2 %3",
        args0: [
          { type: "input_value", name: "A", check: "Number" },
          {
            type: "field_dropdown",
            name: "OP",
            options: [
              ["+", "ADD"],
              ["-", "MINUS"],
              ["×", "MULTIPLY"],
              ["÷", "DIVIDE"],
              ["% 取余", "MODULO"],
            ],
          },
          { type: "input_value", name: "B", check: "Number" },
        ],
        colour: COLORS.data,
        output: "Number",
      });
    },
  },
  logic_compare: {
    init() {
      this.jsonInit({
        message0: "%1 %2 %3",
        args0: [
          { type: "input_value", name: "A" },
          {
            type: "field_dropdown",
            name: "OP",
            options: [
              ["=", "EQ"],
              ["≠", "NEQ"],
              ["<", "LT"],
              ["≤", "LTE"],
              [">", "GT"],
              ["≥", "GTE"],
            ],
          },
          { type: "input_value", name: "B" },
        ],
        colour: COLORS.data,
        output: "Boolean",
      });
    },
  },
  text_print: {
    init() {
      this.jsonInit({
        message0: "输出 %1",
        args0: [{ type: "input_value", name: "TEXT" }],
        colour: COLORS.io,
        previousStatement: null,
        nextStatement: null,
      });
    },
  },
  sensing_ask: {
    init() {
      this.jsonInit({
        message0: "询问 %1 并等待",
        args0: [{ type: "input_value", name: "PROMPT", check: "String" }],
        colour: COLORS.io,
        output: "String",
      });
    },
  },
  text: {
    init() {
      this.jsonInit({
        message0: "%1",
        args0: [{ type: "field_input", name: "TEXT", text: "" }],
        colour: COLORS.text,
        output: "String",
      });
    },
  },
  text_join: {
    init() {
      this.jsonInit({
        message0: "拼接 %1 与 %2",
        args0: [
          { type: "input_value", name: "A" },
          { type: "input_value", name: "B" },
        ],
        colour: COLORS.text,
        output: "String",
      });
    },
  },
};

const categoryDefinitions = [
  { name: "控制", colour: COLORS.control, types: ["controls_if", "controls_repeat_ext"] },
  {
    name: "数据",
    colour: COLORS.data,
    types: ["variables_set", "variables_get", "math_number", "math_arithmetic", "logic_compare"],
    variableButton: true,
  },
  { name: "输入输出", colour: COLORS.io, types: ["sensing_ask", "text_print"] },
  { name: "文本", colour: COLORS.text, types: ["text", "text_join"] },
];

export function buildToolbox() {
  return categoryDefinitions
    .map((category) => ({
      kind: "category",
      name: category.name,
      colour: category.colour,
      contents: [
        ...(category.variableButton
          ? [{
              kind: "button",
              text: "新建变量",
              callbackKey: "CREATE_VARIABLE_FOR_BLOCK",
            }]
          : []),
        ...category.types.map((type) => ({ kind: "block", type })),
      ],
    }))
    .filter((category) => category.contents.length > 0);
}

function registerPythonGenerators() {
  const generator = pythonGenerator;
  const valueCode = (block: Blockly.Block, name: string) =>
    generator.valueToCode(block, name, 0) || "None";
  const variableName = (block: Blockly.Block, fieldName = "VAR") =>
    generator.getVariableName(block.getFieldValue(fieldName));

  generator.forBlock.variables_get = (block: Blockly.Block) => [variableName(block), 0];
  generator.forBlock.variables_set = (block: Blockly.Block) =>
    `${variableName(block)} = ${valueCode(block, "VALUE")}\n`;
  generator.forBlock.math_number = (block: Blockly.Block) => [String(block.getFieldValue("NUM")), 0];
  generator.forBlock.text = (block: Blockly.Block) => [JSON.stringify(block.getFieldValue("TEXT") || ""), 0];
  generator.forBlock.sensing_ask = (block: Blockly.Block) => [`input(${valueCode(block, "PROMPT")})`, 0];
  generator.forBlock.text_print = (block: Blockly.Block) => `print(${valueCode(block, "TEXT")})\n`;
  generator.forBlock.text_join = (block: Blockly.Block) => [
    `(str(${valueCode(block, "A")}) + str(${valueCode(block, "B")}))`,
    0,
  ];
  generator.forBlock.math_arithmetic = (block: Blockly.Block) => {
    const operators: Record<string, string> = {
      ADD: "+",
      MINUS: "-",
      MULTIPLY: "*",
      DIVIDE: "/",
      MODULO: "%",
    };
    return [
      `(${valueCode(block, "A")} ${operators[block.getFieldValue("OP")] || "+"} ${valueCode(block, "B")})`,
      0,
    ];
  };
  generator.forBlock.logic_compare = (block: Blockly.Block) => {
    const operators: Record<string, string> = {
      EQ: "==",
      NEQ: "!=",
      LT: "<",
      LTE: "<=",
      GT: ">",
      GTE: ">=",
    };
    return [
      `(${valueCode(block, "A")} ${operators[block.getFieldValue("OP")] || "=="} ${valueCode(block, "B")})`,
      0,
    ];
  };
  generator.forBlock.controls_if = (block: Blockly.Block) => {
    const yes = generator.statementToCode(block, "DO0") || "    pass\n";
    const no = generator.statementToCode(block, "ELSE");
    return `if ${valueCode(block, "IF0")}:\n${yes}${no ? `else:\n${no}` : ""}`;
  };
  generator.forBlock.controls_repeat_ext = (block: Blockly.Block) => {
    const body = generator.statementToCode(block, "DO") || "    pass\n";
    return `for ${variableName(block)} in range(${valueCode(block, "TIMES")}):\n${body}`;
  };
}

export function registerCustomBlocks() {
  for (const [name, definition] of Object.entries(blockDefs)) {
    Blockly.Blocks[name] = definition;
  }
  registerPythonGenerators();
}
