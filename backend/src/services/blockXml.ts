// 将 inferred_blocks 转换为 Blockly 只读积木 XML
// C 阶段左栏展示用：所有积木平铺排列，不连接，仅供观察
interface InferBlocks {
  [type: string]: { count: number; fields?: Record<string, string[]> };
}

export function blocksToXml(blocks: InferBlocks): string {
  let xml = '<xml xmlns="https://developers.google.com/blockly/xml">';

  // 按类别排序，同类积木排在一起
  const order = ["variables_set", "variables_get", "math_number", "math_arithmetic",
    "logic_compare", "logic_operation", "logic_negate", "math_random_int",
    "controls_if", "controls_repeat_ext", "controls_whileUntil",
    "sensing_ask", "text_print", "text", "text_join", "text_length"];

  const sorted = order.filter((t) => blocks[t]);

  let x = 30, y = 30;
  for (const type of sorted) {
    const spec = blocks[type];
    for (let i = 0; i < spec.count; i++) {
      xml += `<block type="${type}" x="${x}" y="${y}">`;
      if (spec.fields) {
        for (const [fieldName, values] of Object.entries(spec.fields)) {
          if (values[i] !== undefined) {
            xml += `<field name="${fieldName}">${escapeXml(String(values[i]))}</field>`;
          }
        }
      }
      xml += "</block>";
      y += 60;
    }
    y += 10;
    if (y > 450) { y = 30; x += 250; }
  }
  xml += "</xml>";
  return xml;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
