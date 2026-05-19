import { BLOCK_DEFINITIONS_FOR_LLM } from "./blockDefinitions";

const API_URL =
  process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";

interface BlockSpec {
  count: number;
  fields?: Record<string, string[]>;
}

export interface InferResult {
  blocks: Record<string, BlockSpec>;
  note?: string;
}

// Call LLM to translate Python code into block requirements
export async function inferBlocksFromCode(code: string): Promise<InferResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set");

  const prompt = `You are the backend of a programming teaching system. Your task is to translate a Python code snippet into its corresponding Blockly block requirements.

${BLOCK_DEFINITIONS_FOR_LLM}

Analyze the following Python code and output the block requirements in JSON:

\`\`\`python
${code}
\`\`\`

Analysis steps:
1. Count all numeric literals — each number = 1 math_number
2. Count all string literals — each string = 1 text
3. Count all print() — each print needs 1 text_print + corresponding number of text blocks
4. Count all variable assignments (=) — each assignment needs 1 variables_set
5. Count all if/for — needs corresponding control blocks
6. Count all comparisons (>=, <, ==, etc.) — needs logic_compare
7. Count all input() — needs sensing_ask
8. Count all len() — needs text_length
9. Count all string concatenation (+) — needs text_join
10. If the same block type appears multiple times, count is the actual number

Distinguish between fields and input slots. Return JSON only, no extra text.`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a precise programming analysis tool. Return JSON only, no explanation." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data: any = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";

  // Try to extract JSON (LLM might wrap it in markdown)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in LLM response");

  const parsed = JSON.parse(jsonMatch[0]) as InferResult;

  // Fallback: regex count numeric literals in Python code, correct math_number count
  const numericLiterals = code.match(/\b\d+\b/g) || [];
  if (numericLiterals.length > 0) {
    if (!parsed.blocks) parsed.blocks = {};
    if (!parsed.blocks.math_number) {
      parsed.blocks.math_number = { count: numericLiterals.length };
    } else {
      parsed.blocks.math_number.count = numericLiterals.length;
    }
    // Fill NUM values
    if (!parsed.blocks.math_number.fields) {
      parsed.blocks.math_number.fields = {};
    }
    parsed.blocks.math_number.fields!.NUM = numericLiterals.map(String);
  }

  return parsed;
}

// Use LLM to generate complete, connected Blockly XML (for C-stage read-only display)
export async function inferConnectedXml(code: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set");

  const prompt = `Translate the following Python code into Blockly XML. Blocks must be connected end-to-end forming a complete structure.

${BLOCK_DEFINITIONS_FOR_LLM}

Blockly XML format:
- Top-level blocks are connected with <next>
- Child blocks go inside <value name="NAME">...</value> or <statement name="NAME">...</statement>
- Field values are written as <field name="NAME">value</field>
- Every block must have a type attribute

Generate the fully connected Blockly XML for this Python code:

\`\`\`python
${code}
\`\`\`

Return pure XML only, no markdown code block wrapping.`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a precise Blockly XML generator. Return XML only, no explanation." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 3072,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data: any = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";

  // Extract XML (may be wrapped in markdown)
  const xmlMatch = raw.match(/<xml[\s\S]*?<\/xml>/);
  if (xmlMatch) return xmlMatch[0];

  throw new Error("No XML found in LLM response");
}
