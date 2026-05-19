import pool from "../config/database";

function getConfig(key: string): Promise<string | null> {
  return pool.query<any[]>("SELECT value FROM system_config WHERE `key` = ?", [key])
    .then(([rows]) => rows.length > 0 ? rows[0].value : null);
}

function setConfig(key: string, value: string): Promise<void> {
  return pool.query(
    "INSERT INTO system_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?",
    [key, value, value]
  ).then(() => {});
}

async function getStagePrompts(): Promise<Record<string, string>> {
  const defaults: Record<string, string> = {
    P: "You are a programming teacher. Break down Python code into blocks and explain. Reply in 3-5 sentences. Use 【block name】 to annotate. Do not answer unrelated questions.",
    A: "You are a programming coach. The student is building blocks from Python code. Give direction, not answers. Reply in 2-3 sentences. Do not answer unrelated questions.",
    C: "You are a programming guide. The student is writing Python code by looking at block diagrams. Only respond when asked. **Never give code** — no snippets, pseudo-code, or examples. Reply in 1-2 sentences.",
    I: "You are a learning partner. Use a peer tone. First summarize the knowledge points from this task (2-3 sentences), then ask the student a question (1 sentence). Then discuss freely. Reply in 3-4 sentences.",
  };
  const raw = await getConfig("stage_prompts");
  if (raw) {
    try { return { ...defaults, ...JSON.parse(raw) }; } catch {}
  }
  return defaults;
}

async function getBlockNameIndex(): Promise<string> {
  const defaultBlockNames = [
    "controls_if = if/else block (Blue - Control)",
    "controls_repeat_ext = repeat N times block (Blue - Control)",
    "controls_whileUntil = while loop block (Blue - Control)",
    "variables_set = variable assignment block (Orange - Data)",
    "math_number = number block (Orange - Data)",
    "math_arithmetic = arithmetic block (Orange - Data)",
    "logic_compare = comparison block (Orange - Data)",
    "logic_operation = and/or block (Orange - Data)",
    "logic_negate = not block (Orange - Data)",
    "math_random_int = random integer block (Orange - Data)",
    "sensing_ask = ask and wait block (Green - I/O)",
    "text_print = print block (Green - I/O)",
    "text = text content block (Purple - Text)",
    "text_join = text join block (Purple - Text)",
    "text_length = string length block (Purple - Text)",
  ].join("\n");
  const raw = await getConfig("block_name_index");
  if (raw) return raw;
  return `\nBlock Name Reference (LLM must use English names in replies, not raw IDs):\n  ${defaultBlockNames.replace(/\n/g, "\n  ")}\n`;
}

let cachedPrompts: Record<string, string> | null = null;
let cachedBlockNames: string | null = null;

export async function refreshConfigCache() {
  cachedPrompts = null;
  cachedBlockNames = null;
}

export async function getCachedPrompts(): Promise<Record<string, string>> {
  if (!cachedPrompts) cachedPrompts = await getStagePrompts();
  return cachedPrompts!;
}

export async function getCachedBlockNames(): Promise<string> {
  if (!cachedBlockNames) cachedBlockNames = await getBlockNameIndex();
  return cachedBlockNames!;
}

export async function savePromptsToDb(prompts: Record<string, string>): Promise<void> {
  await setConfig("stage_prompts", JSON.stringify(prompts));
}

export async function saveBlockNamesToDb(content: string): Promise<void> {
  await setConfig("block_name_index", content);
}
