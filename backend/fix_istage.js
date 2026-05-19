// Direct i_stage fix - read CN, translate, write EN
const mysql = require("mysql2/promise");

const i18n = {
  // Task 1
  "if-else 用于条件判断": "if-else is used for conditional branching",
  "比较运算符返回 True 或 False": "Comparison operators return True or False",
  "缩进区分代码块": "Indentation distinguishes code blocks",
  "嵌套 if 可以实现多级判断": "Nested if enables multi-level decisions",
  "如果成绩刚好是 60 分会输出什么？": "What would be output if the score is exactly 60?",
  "如果把 >= 改成 > 会怎样？": "What would happen if we changed >= to >?",

  // Task 2
  "for 循环重复执行代码": "for loop repeats code execution",
  "range(n) 产生 0 到 n-1 的数列": "range(n) generates numbers from 0 to n-1",
  "缩进决定代码归属循环体": "Indentation determines what belongs to the loop body",
  "循环里的 i 每次值不同": "Variable i takes a different value each loop iteration",
  "range(5) 循环5次，但 i 从0到4，为什么？": "range(5) loops 5 times, but i goes from 0 to 4. Why?",
  "如果要画 7 行的三角形该改哪？": "If we wanted to draw a triangle with 7 rows, what would we change?",

  // Task 3
  "input() 获取用户输入，返回字符串": "input() gets user input and returns a string",
  "len() 计算字符串长度": "len() calculates string length",
  "获取输入后可以存到变量里复用": "Captured input can be stored in variables for reuse",
  "input + if 可以实现交互式判断": "input + if enables interactive decision-making",
  "如果用户什么都不输入直接回车，len() 会返回多少？": "If the user presses Enter without typing anything, what would len() return?",
  "能不能先用 input() 要一个数字，再用 if 判断大小？": "Could we use input() to get a number and then use if to check its size?",

  // Task 4
  "for 循环可以遍历一段数字": "for loop can iterate over a range of numbers",
  "% 取余运算能判断奇偶": "% modulo operator can determine even or odd",
  "if 可以放在循环里做逐次判断": "if can be placed inside a loop for per-iteration checks",
  "用变量计数是常见的编程技巧": "Using a counter variable is a common programming technique",
  "如果不数偶数，改为数奇数，代码要改哪里？": "If we wanted to count odd numbers instead of even, what would we change?",
  "count = count + 1 这个写法和 count += 1 一样吗？": "Is count = count + 1 the same as count += 1?",
};

function translate(arr) {
  return arr.map(s => i18n[s] || s);
}

function deepFix(obj) {
  if (Array.isArray(obj)) return obj.map(item => typeof item === "string" ? (i18n[item] || item) : deepFix(item));
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deepFix(v);
    }
    return result;
  }
  return obj;
}

async function main() {
  const cnPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform" });
  const enPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });

  const [cnRows] = await cnPool.query("SELECT id, content_json FROM tasks");
  const [enRows] = await enPool.query("SELECT id, content_json FROM tasks ORDER BY id");

  for (const cnRow of cnRows) {
    const enId = cnRow.id - 6; // CN 7→EN 1, 8→2, 9→3, 10→4
    const enRow = enRows.find(r => r.id === enId);
    if (!enRow) continue;

    const enContent = enRow.content_json;
    
    // Fix i_stage
    if (cnRow.content_json.i_stage) {
      const cnI = cnRow.content_json.i_stage;
      const translated = deepFix(cnI);
      enContent.i_stage = translated;
    }

    // Fix c_stage description if still Chinese
    if (cnRow.content_json.c_stage) {
      const cnDesc = cnRow.content_json.c_stage.description;
      if (cnDesc && enContent.c_stage) {
        // Only override if current EN desc contains Chinese
        if (/[\u4e00-\u9fff]/.test(enContent.c_stage.description || "")) {
          enContent.c_stage.description = deepFix(cnDesc);
        }
      }
      // Fix code_skeleton
      if (cnRow.content_json.c_stage.code_skeleton) {
        enContent.c_stage.code_skeleton = deepFix(cnRow.content_json.c_stage.code_skeleton);
      }
    }

    await enPool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [JSON.stringify(enContent), enId]);
    console.log(`Task ${enId}: i_stage fixed`);
  }

  await cnPool.end();
  await enPool.end();
  console.log("Done!");
}

main().catch(console.error);
