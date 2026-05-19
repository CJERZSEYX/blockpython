const mysql = require("mysql2/promise");

const map = {
  // === Task 1 ===
  "及格": "Pass",
  
  // === Task 2 ===
  "range(5) 表示重复5次。执行的代码要有缩进。": "range(5) means repeat 5 times. The code inside must be indented.",
  "数字": "Number",
  "range(5) 里的5表示循环次数，改成3就循环3次。": "The 5 in range(5) sets the loop count. Change to 3 to loop 3 times.",
  "print 在循环里": "print in Loop",
  "这个 print 在循环内部，所以会被执行5次，屏幕上打印5条短线。": "This print is inside the loop, so it runs 5 times, printing 5 dashes on screen.",
  "表示重复": "Means repeat",

  // === Task 3 ===
  "名字很长": "Long name",
  "名字很短": "Short name",
  "input() 让程序停下来等用户输入。括号里是提示语。": "input() pauses the program to wait for user input. The prompt text goes in parentheses.",
  "name = input('请输入你的名字：')": "name = input('Enter your name:')",
  "存储到变量": "Store in Variable",
  "把 input() 拿到的东西存到变量 name 里。": "Store what input() gets into the variable name.",
  "len() 返回字符串的长度（有几个字）。输入'小明'，len() 返回2。": "len() returns the length of a string (how many characters). Input 'Tom', len() returns 3.",
  "条件输出": "Conditional Output",
  "先用 len() 得到名字长度，再用 if 判断是否大于3。": "First use len() to get the name length, then use if to check if it's greater than 3.",

  // === Task 4 ===
  "循环回顾": "Loop Review",
  "回顾：for 循环让 print(i) 执行 10 次，i 从 0 到 9。": "Review: for loop makes print(i) run 10 times, i from 0 to 9.",
  "取余运算": "Modulo Operation",
  "加减乘除取余": "Arithmetic (add/sub/mul/div/mod)",
  "% 是取余数运算。i % 2 得到 i 除以 2 的余数。余数为 0 说明 i 是偶数。": "% is the modulo operator. i % 2 gives the remainder of i divided by 2. A remainder of 0 means i is even.",
  "循环里判断": "Condition in Loop",
  "把 if 放进循环里——每轮循环都执行一次判断。": "Place if inside the loop — each iteration runs the check once.",
};

function translate(str) {
  if (!str || typeof str !== "string") return str;
  let result = str;
  for (const [cn, en] of Object.entries(map)) {
    if (result.includes(cn)) result = result.split(cn).join(en);
  }
  return result;
}

function deepTranslate(obj) {
  if (typeof obj === "string") return translate(obj);
  if (Array.isArray(obj)) return obj.map(deepTranslate);
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "blocks_xml") { result[k] = v; continue; }
      result[k] = deepTranslate(v);
    }
    return result;
  }
  return obj;
}

async function main() {
  const cnPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform" });
  const enPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });

  const [cnRows] = await cnPool.query("SELECT id, content_json FROM tasks ORDER BY id");
  const [enRows] = await enPool.query("SELECT id, content_json FROM tasks ORDER BY id");

  for (const cnRow of cnRows) {
    const enId = cnRow.id - 6;
    const enRow = enRows.find(r => r.id === enId);
    if (!enRow) continue;

    // Deep translate from Chinese source, preserving English version's a_stage and blocks_xml
    const enContent = enRow.content_json;
    
    // Translate p_stage from Chinese
    if (cnRow.content_json.p_stage) {
      enContent.p_stage = deepTranslate(JSON.parse(JSON.stringify(cnRow.content_json.p_stage)));
    }
    
    // Translate c_stage fields (preserve blocks_xml)
    if (cnRow.content_json.c_stage && enContent.c_stage) {
      enContent.c_stage.title = translate(cnRow.content_json.c_stage.title || enContent.c_stage.title);
      enContent.c_stage.description = translate(cnRow.content_json.c_stage.description || enContent.c_stage.description);
      enContent.c_stage.expected_output = translate(cnRow.content_json.c_stage.expected_output || enContent.c_stage.expected_output);
      if (cnRow.content_json.c_stage.answer_code) {
        enContent.c_stage.answer_code = translate(cnRow.content_json.c_stage.answer_code);
      }
    }
    
    // Translate i_stage
    if (cnRow.content_json.i_stage) {
      enContent.i_stage = deepTranslate(JSON.parse(JSON.stringify(cnRow.content_json.i_stage)));
    }

    await enPool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [JSON.stringify(enContent), enId]);
    console.log(`Task ${enId}: re-translated`);
  }

  await cnPool.end();
  await enPool.end();
  console.log("Done!");
}

main().catch(console.error);
