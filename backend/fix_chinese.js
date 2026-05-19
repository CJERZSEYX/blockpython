const mysql = require("mysql2/promise");

const translations = {
  // Task 1 c_stage
  "根据成绩判断等级：90分及以上为优秀，60分及以上为及格，其余不及格。注意这里用的是嵌套if：先判断>=90，不成立再判断>=60。": "Determine grade: >=90 is Excellent, >=60 is Pass, otherwise Fail. Note the nested if: first check >=90, then check >=60.",
  "根据成绩判断等级：≥90优秀，≥60及格，<60不及格。在A阶段基础上，将else改为另一个if-else。": "Determine grade: >=90 Excellent, >=60 Pass, <60 Fail. Replace the else in stage A with another if-else.",
  
  // Task 3 c_stage
  "输入名字后，判断名字长度：超过3个字输出[名字很长]，否则输出[名字很短]。提示：用 len() 获取字符串长度。": "After entering a name, check its length: if more than 3 characters print [Long name], otherwise [Short name]. Hint: use len() to get string length.",
  
  // Task 4 c_stage
  "循环 10 次，数一数其中有多少个偶数。提示：先用一个变量 count=0，每次遇到偶数就让 count 加 1。": "Loop 10 times and count how many even numbers there are. Hint: start with count=0, increment when an even number is found.",
  
  // i_stage common
  "for 循环重复执行后变量递减": "Variable decrement after loop repetition",
  "嵌套 if-else 做多级判断": "Nested if-else for multi-level decisions",
  "input()获取用户输入与判断": "Using input() for user input and conditions",
  "综合运用循环和条件判断计数": "Combine loops and conditionals for counting",
  "for 循环中的变量递减操作（n = n - 1）": "Variable decrement in for loop (n = n - 1)",
  "循环中用if实现多级判断": "Using if inside loops for multi-level decisions",
  "input()将用户输入存入变量": "Storing user input in variables with input()",
  "循环中的条件统计": "Conditional counting in loops",
  
  // i_stage questions
  "如果循环5次改成循环3次，会输出什么？": "What would happen if we changed the loop from 5 to 3 iterations?",
  "在A阶段里用了一个if-else判断及格，现在我们可以用嵌套if-else判断多个等级。": "In stage A we used one if-else to check pass/fail. Now we can use nested if-else for multiple grade levels.",
  "如果用户输入空格怎么办？多输入几个空格后长度会不会变化？": "What if the user inputs spaces? Would the length change with extra spaces?",
  "如果不打印'偶'和'奇'，而用一个变量计数，你能计算出有多少个偶数吗？": "Instead of printing 'Even'/'Odd', can you count how many even numbers there are using a counter variable?",
  "如果 n=5 改成 n=10，会输出什么？": "What would happen if we changed n=5 to n=10?",
  "除了用 for 循环，还可以用什么循环方式？": "Besides for loops, what other looping methods exist?",
  "如果成绩是59分会走哪个分支？为什么？": "If the score is 59, which branch would it take? Why?",
  "循环配合判断：if 和 for 怎么一起用？": "Combining loops with conditionals: how do if and for work together?",

  // code_skeleton
  "请输入你的名字：": "Enter your name:",
  
  // blocks_xml text values
  ">优秀<": ">Excellent<",
  ">及格<": ">Pass<",
  ">不及格<": ">Fail<",
  ">名字很长<": ">Long name<",
  ">名字很短<": ">Short name<",
  ">请输入你的名字：<": ">Enter your name:<",
};

function replaceChinese(str) {
  if (!str) return str;
  let result = str;
  for (const [cn, en] of Object.entries(translations)) {
    result = result.split(cn).join(en);
  }
  return result;
}

function deepTranslate(obj) {
  if (typeof obj === "string") return replaceChinese(obj);
  if (Array.isArray(obj)) return obj.map(deepTranslate);
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deepTranslate(v);
    }
    return result;
  }
  return obj;
}

async function main() {
  const pool = mysql.createPool({
    host: "localhost", port: 3306, user: "root", password: "123456",
    database: "icap_platform_english", waitForConnections: true, connectionLimit: 2,
  });

  const [rows] = await pool.query("SELECT id, content_json FROM tasks ORDER BY id");
  
  for (const row of rows) {
    const original = JSON.stringify(row.content_json);
    const translated = deepTranslate(row.content_json);
    const newJson = JSON.stringify(translated);
    
    if (original !== newJson) {
      // Delete inferred_blocks (regenerate)
      delete translated.inferred_blocks;
      if (translated.c_stage) {
        delete translated.c_stage.inferred_blocks;
        // Preserve blocks_xml if it was already generated
      }
      
      await pool.query("UPDATE tasks SET content_json = ? WHERE id = ?", [
        JSON.stringify(translated), row.id
      ]);
      console.log(`Task ${row.id}: UPDATED (Chinese text found and translated)`);
    } else {
      console.log(`Task ${row.id}: OK (no Chinese text found)`);
    }
  }

  await pool.end();
  console.log("Done!");
}

main().catch(console.error);
