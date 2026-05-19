const mysql = require("mysql2/promise");

async function translateWithLLM(text) {
  const apiKey = "sk-e6199a4dc0ea4e98b76a70157b1d123e";
  
  // Only translate if text contains Chinese
  if (!/[\u4e00-\u9fff]/.test(text)) return text;
  
  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Translate the following Chinese programming education text to English. Keep technical terms (like variable names, function names) unchanged. Only translate the natural language parts. Output ONLY the translation, nothing else." },
        { role: "user", content: text }
      ],
      temperature: 0.1,
      max_tokens: 256,
    }),
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || text;
}

async function translateChineseFields(obj) {
  if (typeof obj === "string") {
    if (/[\u4e00-\u9fff]/.test(obj)) {
      const translated = await translateWithLLM(obj);
      console.log(`  "${obj.substring(0, 40)}" → "${translated.substring(0, 40)}"`);
      return translated;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    const result = [];
    for (const item of obj) result.push(await translateChineseFields(item));
    return result;
  }
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "blocks_xml") { result[k] = v; continue; }
      result[k] = await translateChineseFields(v);
    }
    return result;
  }
  return obj;
}

async function main() {
  const enPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });
  const [rows] = await enPool.query("SELECT id, content_json FROM tasks ORDER BY id");

  for (const row of rows) {
    console.log(`\n=== Task ${row.id} ===`);
    const translated = await translateChineseFields(row.content_json);
    
    // Don't overwrite inferred_blocks
    delete translated.inferred_blocks;
    
    const cnt = (JSON.stringify(translated).match(/[\u4e00-\u9fff]/g) || []).length;
    await enPool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [JSON.stringify(translated), row.id]);
    console.log(`  Remaining Chinese chars: ${cnt}`);
  }

  await enPool.end();
  console.log("\nAll done!");
}

main().catch(console.error);
