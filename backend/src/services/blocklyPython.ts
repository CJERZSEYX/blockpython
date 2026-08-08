import { XMLParser } from "fast-xml-parser";

interface XmlField {
  name: string;
  "#text"?: string | number;
}

interface XmlValue {
  name: string;
  block?: XmlBlock[];
}

interface XmlStatement {
  name: string;
  block?: XmlBlock[];
}

interface XmlNext {
  block?: XmlBlock[];
}

interface XmlBlock {
  type: string;
  id?: string;
  field?: XmlField[];
  value?: XmlValue[];
  statement?: XmlStatement[];
  next?: XmlNext[];
}

export interface BlockDiagnostic {
  code:
    | "empty_workspace"
    | "floating_blocks"
    | "missing_input"
    | "empty_statement"
    | "unsupported_block"
    | "invalid_variable";
  message: string;
  block_id?: string;
}

export interface BlockGenerationResult {
  valid: boolean;
  code: string;
  line_block_map: Record<number, string>;
  diagnostics: BlockDiagnostic[];
  block_count: number;
  block_types: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ["block", "field", "value", "statement", "next"].includes(name),
});

const allowedTypes = new Set([
  "controls_if",
  "controls_repeat_ext",
  "variables_set",
  "variables_get",
  "math_number",
  "math_arithmetic",
  "logic_compare",
  "text_print",
  "sensing_ask",
  "text",
  "text_join",
]);

const operatorMap: Record<string, string> = {
  ADD: "+",
  MINUS: "-",
  MULTIPLY: "*",
  DIVIDE: "/",
  MODULO: "%",
};

const compareMap: Record<string, string> = {
  EQ: "==",
  NEQ: "!=",
  LT: "<",
  LTE: "<=",
  GT: ">",
  GTE: ">=",
};

function getField(block: XmlBlock, name: string, preserveWhitespace = false): string {
  const item = block.field?.find((candidate) => candidate.name === name);
  const value = String(item?.["#text"] ?? "");
  return preserveWhitespace ? value : value.trim();
}

function getValue(block: XmlBlock, name: string): XmlBlock | undefined {
  return block.value?.find((candidate) => candidate.name === name)?.block?.[0];
}

function getStatement(block: XmlBlock, name: string): XmlBlock | undefined {
  return block.statement?.find((candidate) => candidate.name === name)?.block?.[0];
}

function getNext(block: XmlBlock): XmlBlock | undefined {
  return block.next?.[0]?.block?.[0];
}

function safeVariableName(name: string): string | null {
  const trimmed = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return null;
  return trimmed;
}

export function generatePythonFromBlockly(xmlText: string): BlockGenerationResult {
  const diagnostics: BlockDiagnostic[] = [];
  const lines: string[] = [];
  const lineBlockMap: Record<number, string> = {};
  let blockCount = 0;
  const blockTypes = new Set<string>();

  let parsed: any;
  try {
    parsed = parser.parse(xmlText);
  } catch {
    return {
      valid: false,
      code: "",
      line_block_map: {},
      block_count: 0,
      block_types: [],
      diagnostics: [{ code: "empty_workspace", message: "积木数据无法读取" }],
    };
  }

  const roots = (parsed?.xml?.block || []) as XmlBlock[];
  if (roots.length === 0) {
    diagnostics.push({ code: "empty_workspace", message: "工作区中还没有可执行积木" });
  }
  if (roots.length > 1) {
    for (const root of roots.slice(1)) {
      diagnostics.push({
        code: "floating_blocks",
        message: "存在未连接到主程序的游离积木",
        block_id: root.id,
      });
    }
  }

  const emit = (text: string, blockId: string | undefined, indent: number) => {
    lines.push(`${"    ".repeat(indent)}${text}`);
    if (blockId) lineBlockMap[lines.length] = blockId;
  };

  const requireValue = (source: XmlBlock, name: string, label: string) => {
    const child = getValue(source, name);
    if (!child) {
      diagnostics.push({
        code: "missing_input",
        message: `${label}缺少输入`,
        block_id: source.id,
      });
    }
    return child;
  };

  const expression = (source: XmlBlock | undefined): string => {
    if (!source) return "None";
    blockCount += 1;
    blockTypes.add(source.type);
    if (!allowedTypes.has(source.type)) {
      diagnostics.push({
        code: "unsupported_block",
        message: `当前课程不支持积木 ${source.type}`,
        block_id: source.id,
      });
      return "None";
    }

    switch (source.type) {
      case "math_number": {
        const raw = getField(source, "NUM");
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          diagnostics.push({
            code: "missing_input",
            message: "数字积木需要填写有效数字",
            block_id: source.id,
          });
          return "0";
        }
        return String(numeric);
      }
      case "text":
        return JSON.stringify(getField(source, "TEXT", true));
      case "variables_get": {
        const name = safeVariableName(getField(source, "VAR"));
        if (!name) {
          diagnostics.push({
            code: "invalid_variable",
            message: "变量名只能使用英文字母、数字和下划线，且不能以数字开头",
            block_id: source.id,
          });
          return "_invalid_variable";
        }
        return name;
      }
      case "sensing_ask": {
        const prompt = requireValue(source, "PROMPT", "询问积木");
        return `input(${expression(prompt)})`;
      }
      case "math_arithmetic": {
        const left = requireValue(source, "A", "算术积木左侧");
        const right = requireValue(source, "B", "算术积木右侧");
        const operator = operatorMap[getField(source, "OP")] || "+";
        return `(${expression(left)} ${operator} ${expression(right)})`;
      }
      case "logic_compare": {
        const left = requireValue(source, "A", "比较积木左侧");
        const right = requireValue(source, "B", "比较积木右侧");
        const operator = compareMap[getField(source, "OP")] || "==";
        return `(${expression(left)} ${operator} ${expression(right)})`;
      }
      case "text_join": {
        const left = requireValue(source, "A", "拼接积木左侧");
        const right = requireValue(source, "B", "拼接积木右侧");
        return `(str(${expression(left)}) + str(${expression(right)}))`;
      }
      default:
        diagnostics.push({
          code: "unsupported_block",
          message: `${source.type}不能放在当前输入位置`,
          block_id: source.id,
        });
        return "None";
    }
  };

  const statements = (start: XmlBlock | undefined, indent: number) => {
    let current = start;
    while (current) {
      blockCount += 1;
      blockTypes.add(current.type);
      if (!allowedTypes.has(current.type)) {
        diagnostics.push({
          code: "unsupported_block",
          message: `当前课程不支持积木 ${current.type}`,
          block_id: current.id,
        });
        current = getNext(current);
        continue;
      }

      switch (current.type) {
        case "variables_set": {
          const name = safeVariableName(getField(current, "VAR"));
          if (!name) {
            diagnostics.push({
              code: "invalid_variable",
              message: "变量名只能使用英文字母、数字和下划线，且不能以数字开头",
              block_id: current.id,
            });
          }
          const assigned = requireValue(current, "VALUE", "变量赋值积木");
          emit(`${name || "_invalid_variable"} = ${expression(assigned)}`, current.id, indent);
          break;
        }
        case "text_print": {
          const printed = requireValue(current, "TEXT", "输出积木");
          emit(`print(${expression(printed)})`, current.id, indent);
          break;
        }
        case "controls_if": {
          const condition = requireValue(current, "IF0", "如果积木条件");
          emit(`if ${expression(condition)}:`, current.id, indent);
          const yes = getStatement(current, "DO0");
          if (!yes) {
            diagnostics.push({
              code: "empty_statement",
              message: "如果分支中还没有可执行积木",
              block_id: current.id,
            });
            emit("pass", current.id, indent + 1);
          } else {
            statements(yes, indent + 1);
          }
          const no = getStatement(current, "ELSE");
          if (no) {
            emit("else:", current.id, indent);
            statements(no, indent + 1);
          }
          break;
        }
        case "controls_repeat_ext": {
          const times = requireValue(current, "TIMES", "循环次数");
          const variableName = safeVariableName(getField(current, "VAR") || "i");
          if (!variableName) {
            diagnostics.push({
              code: "invalid_variable",
              message: "循环变量名不正确",
              block_id: current.id,
            });
          }
          emit(`for ${variableName || "i"} in range(${expression(times)}):`, current.id, indent);
          const body = getStatement(current, "DO");
          if (!body) {
            diagnostics.push({
              code: "empty_statement",
              message: "循环内部还没有可执行积木",
              block_id: current.id,
            });
            emit("pass", current.id, indent + 1);
          } else {
            statements(body, indent + 1);
          }
          break;
        }
        default:
          diagnostics.push({
            code: "unsupported_block",
            message: `${current.type}不能单独作为一条语句`,
            block_id: current.id,
          });
      }

      current = getNext(current);
    }
  };

  if (roots[0]) statements(roots[0], 0);

  return {
    valid: diagnostics.length === 0,
    code: lines.join("\n"),
    line_block_map: lineBlockMap,
    diagnostics,
    block_count: blockCount,
    block_types: [...blockTypes],
  };
}
