import assert from "node:assert/strict";
import * as Blockly from "blockly";
import { registerCustomBlocks } from "../src/components/BlocklyEditor/customBlocks.ts";

registerCustomBlocks();

const workspace = new Blockly.Workspace();
const types = [
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
] as const;
const blocks = Object.fromEntries(
  types.map((type) => [type, workspace.newBlock(type)])
) as Record<(typeof types)[number], Blockly.Block>;

function valueInput(type: (typeof types)[number], name: string) {
  return blocks[type].getInput(name)?.connection || null;
}

function canConnect(
  first: Blockly.Connection | null,
  second: Blockly.Connection | null
) {
  return Boolean(
    first
    && second
    && workspace.connectionChecker.canConnect(first, second, false)
  );
}

const expectedConnections = [
  ["运算结果可作为数字条件", blocks.math_arithmetic.outputConnection, valueInput("controls_if", "IF0")],
  ["运算结果可放入比较左侧", blocks.math_arithmetic.outputConnection, valueInput("logic_compare", "A")],
  ["运算结果可保存到变量", blocks.math_arithmetic.outputConnection, valueInput("variables_set", "VALUE")],
  ["比较结果可作为条件", blocks.logic_compare.outputConnection, valueInput("controls_if", "IF0")],
  ["变量赋值可放入条件分支", blocks.variables_set.previousConnection, valueInput("controls_if", "DO0")],
  ["输出语句可放入条件分支", blocks.text_print.previousConnection, valueInput("controls_if", "ELSE")],
  ["读取变量可参与运算", blocks.variables_get.outputConnection, valueInput("math_arithmetic", "A")],
  ["数字可设置循环次数", blocks.math_number.outputConnection, valueInput("controls_repeat_ext", "TIMES")],
  ["询问结果可保存到变量", blocks.sensing_ask.outputConnection, valueInput("variables_set", "VALUE")],
  ["文本可作为询问内容", blocks.text.outputConnection, valueInput("sensing_ask", "PROMPT")],
  ["文本拼接可用于输出", blocks.text_join.outputConnection, valueInput("text_print", "TEXT")],
] as const;

for (const [label, first, second] of expectedConnections) {
  assert.equal(canConnect(first, second), true, label);
}

const rejectedConnections = [
  ["文本不能参与数值运算", blocks.text.outputConnection, valueInput("math_arithmetic", "A")],
  ["比较结果不能参与数值运算", blocks.logic_compare.outputConnection, valueInput("math_arithmetic", "B")],
  ["数字不能作为询问文字", blocks.math_number.outputConnection, valueInput("sensing_ask", "PROMPT")],
  ["运算值不能直接充当分支语句", blocks.math_arithmetic.outputConnection, valueInput("controls_if", "DO0")],
] as const;

for (const [label, first, second] of rejectedConnections) {
  assert.equal(canConnect(first, second), false, label);
}

workspace.dispose();

const variableWorkspace = new Blockly.Workspace();
function assertVariableIsolation(type: "variables_set" | "variables_get" | "controls_repeat_ext") {
  const firstBlock = variableWorkspace.newBlock(type);
  const secondBlock = variableWorkspace.newBlock(type);
  const originalVariableId = firstBlock.getFieldValue("VAR");
  assert.equal(secondBlock.getFieldValue("VAR"), originalVariableId);

  const isolatedName = `isolated_${type}`;
  const isolatedVariable = variableWorkspace.getVariableMap().createVariable(isolatedName);
  firstBlock.setFieldValue(isolatedVariable.getId(), "VAR");
  assert.equal(firstBlock.getField("VAR")?.getText(), isolatedName);
  assert.notEqual(firstBlock.getFieldValue("VAR"), secondBlock.getFieldValue("VAR"));

  const originalVariable = variableWorkspace
    .getVariableMap()
    .getVariableById(originalVariableId);
  assert.ok(originalVariable);
  const renamedSharedName = `shared_${type}`;
  variableWorkspace.getVariableMap().renameVariable(originalVariable, renamedSharedName);
  assert.equal(firstBlock.getField("VAR")?.getText(), isolatedName);
  assert.equal(secondBlock.getField("VAR")?.getText(), renamedSharedName);
}

assertVariableIsolation("variables_set");
assertVariableIsolation("variables_get");
assertVariableIsolation("controls_repeat_ext");

variableWorkspace.dispose();
console.log("Blockly connection validation passed.");
