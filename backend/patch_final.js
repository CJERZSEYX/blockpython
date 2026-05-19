const mysql = require("mysql2/promise");

// Final comprehensive map covering ALL remaining Chinese strings
const map = {
  "判断成绩等级": "Determine Grade",
  "嵌套判断": "Nested if",
  "优秀": "Excellent",
  "根据成绩判断等级": "Determine grade",
  "分及以上为优秀": " or above is Excellent",
  "其余不": "otherwise",
  "注意这里用的是嵌套": "Note: this uses nested if",
  "先判断": "first check",
  "不成立再判断": "if false, then check",
  "倒数计数": "Countdown",
  "倒数到": "Countdown from",
  "用一个变量": "Use a variable",
  "每次输出": "output each time",
  "然后让": "then",
  "输入名字判断长短": "Check Name Length",
  "请输入你的名字": "Enter your name",
  "输入名字后": "After entering a name",
  "判断名字长度": "check the name length",
  "超过": "more than",
  "个字输出": " characters output",
  "否则输出": "otherwise output",
  "获取字符串长度": "Get string length",
  "获取用户输入": "Get user input",
  "统计偶数的个数": "Count Even Numbers",
  "数一数其中有多少个偶数": "Count how many even numbers there are",
  "先用一个变量": "Start with a variable",
  "每次遇到偶数就让": "increment each time an even is found",
  "循环可以遍历一段": "Loop can iterate over a range of",
  "能判断奇偶": "can determine even or odd",
  "可以放在循环里做逐次判断": "can be placed inside a loop for per-iteration checks",
  "用变量计数是常见的编程技巧": "Using a counter variable is a common programming technique",
  
  // Task 2 c_stage
  "倒数到": "Countdown from",
  
  // i_stage re-translations (ensure these match exactly)
  "if-else 用于条件判断": "if-else is used for conditional branching",
  "比较运算符返回 True 或 False": "Comparison operators return True or False",
  "缩进区分代码块": "Indentation distinguishes code blocks",
  "嵌套 if 可以实现多级判断": "Nested if enables multi-level decisions",
  "如果成绩刚好是 60 分会输出什么？": "What would be output if the score is exactly 60?",
  "如果把 >= 改成 > 会怎样？": "What would happen if we changed >= to >?",
  "for 循环重复执行代码": "for loop repeats code execution",
  "range(n) 产生 0 到 n-1 的数列": "range(n) generates numbers from 0 to n-1",
  "缩进决定代码归属循环体": "Indentation determines what belongs to the loop body",
  "循环里的 i 每次值不同": "Variable i takes a different value each loop iteration",
  "range(5) 循环5次，但 i 从0到4，为什么？": "range(5) loops 5 times but i goes from 0 to 4. Why?",
  "如果要画 7 行的三角形该改哪？": "To draw a triangle with 7 rows, what would we change?",
  "input() 获取用户输入，返回字符串": "input() gets user input and returns a string",
  "len() 计算字符串长度": "len() calculates string length",
  "获取输入后可以存到变量里复用": "Captured input can be stored in variables for reuse",
  "input + if 可以实现交互式判断": "input + if enables interactive decision-making",
  "如果用户什么都不输入直接回车，len() 会返回多少？": "If the user presses Enter without typing, what would len() return?",
  "能不能先用 input() 要一个数字，再用 if 判断大小？": "Could we use input() to get a number and then use if to check its size?",
  "for 循环可以遍历一段数字": "for loop can iterate over a range of numbers",
  "% 取余运算能判断奇偶": "% modulo operator can determine even or odd",
  "if 可以放在循环里做逐次判断": "if can be placed inside a loop for per-iteration checks",
  "count = count + 1 这个写法和 count += 1 一样吗？": "Is count = count + 1 the same as count += 1?",
};

function translate(str) {
  if (!str || typeof str !== "string") return str;
  let result = str;
  // Sort by length descending to replace longest matches first
  const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  for (const [cn, en] of entries) {
    result = result.split(cn).join(en);
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
  const enPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });
  const [rows] = await enPool.query("SELECT id, content_json FROM tasks ORDER BY id");

  for (const row of rows) {
    const original = JSON.stringify(row.content_json);
    const translated = deepTranslate(row.content_json);
    const newJson = JSON.stringify(translated);

    if (original !== newJson) {
      delete translated.inferred_blocks;
      if (translated.c_stage) {
        delete translated.c_stage.inferred_blocks;
        // Clear blocks_xml if it has Chinese — will regenerate via LLM
        if (translated.c_stage.blocks_xml && /[\u4e00-\u9fff]/.test(translated.c_stage.blocks_xml)) {
          translated.c_stage.blocks_xml = undefined;
        }
      }
      await enPool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [JSON.stringify(translated), row.id]);
      console.log(`Task ${row.id}: fixed`);
    } else {
      console.log(`Task ${row.id}: already clean`);
    }
  }

  await enPool.end();
  console.log("Done!");
}

main().catch(console.error);
