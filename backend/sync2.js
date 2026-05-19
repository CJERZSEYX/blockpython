const https = require("https");
const http = require("http");
const mysql = require("mysql2/promise");

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

function translateJson(cnJson) {
  // Deep clone
  const en = JSON.parse(JSON.stringify(cnJson));
  
  // Replace Chinese print strings in Python code
  if (en.a_stage?.python_code) {
    en.a_stage.python_code = en.a_stage.python_code
      .replace(/"及格"/g, '"Pass"')
      .replace(/"不及格"/g, '"Fail"')
      .replace(/"优秀"/g, '"Excellent"')
      .replace(/"请输入你的名字："/g, '"Enter your name:"')
      .replace(/"你好，"/g, '"Hello, "')
      .replace(/"偶"/g, '"Even"')
      .replace(/"奇"/g, '"Odd"');
  }
  
  if (en.c_stage) {
    en.c_stage.title = {
      "判断成绩等级（嵌套判断）": "Determine Grade (Nested if)",
      "倒数计数": "Countdown",
      "输入名字判断长短": "Check Name Length",
      "统计偶数的个数": "Count Even Numbers",
    }[en.c_stage.title] || en.c_stage.title;

    if (en.c_stage.description) {
      en.c_stage.description = {
        "根据成绩判断等级：≥90优秀，≥60及格，<60不及格。在A阶段基础上，将else改为另一个if-else。": "Determine grade: >=90 Excellent, >=60 Pass, <60 Fail. Replace the else in stage A with another if-else.",
        "从5倒数到1。用一个变量n=5，循环5次，每次输出n然后让n减1。": "Countdown from 5 to 1. Use variable n=5, loop 5 times, print n then subtract 1.",
        "编程获取用户输入后，根据名字长度做出不同回应": "Get user input and respond based on name length",
        "循环10次，统计其中偶数的个数。用count变量累加，每次遇到偶数就count+1，最后输出count。": "Loop 10 times, count even numbers. Use a count variable, increment when even, print final count.",
      }[en.c_stage.description] || en.c_stage.description;
    }

    if (en.c_stage.code_skeleton) {
      en.c_stage.code_skeleton = en.c_stage.code_skeleton
        .replace("请输入你的名字：", "Enter your name:");
    }

    if (en.c_stage.answer_code) {
      en.c_stage.answer_code = en.c_stage.answer_code
        .replace(/"请输入你的名字："/g, '"Enter your name:"')
        .replace(/"优秀"/g, '"Excellent"')
        .replace(/"及格"/g, '"Pass"')
        .replace(/"不及格"/g, '"Fail"')
        .replace(/"偶"/g, '"Even"')
        .replace(/"奇"/g, '"Odd"');
    }

    if (en.c_stage.blocks_xml) {
      en.c_stage.blocks_xml = en.c_stage.blocks_xml
        .replace(/>优秀</g, ">Excellent<")
        .replace(/>及格</g, ">Pass<")
        .replace(/>不及格</g, ">Fail<")
        .replace(/>名字很长</g, ">Long name<")
        .replace(/>名字很短</g, ">Short name<")
        .replace(/>请输入你的名字：</g, ">Enter your name:<");
    }

    // Clear LLM-generated cache, will re-infer
    delete en.c_stage.inferred_blocks;
  }

  if (en.i_stage) {
    const translateMap = {
      "for 循环重复执行后变量递减": "Variable decrement after loop repetition",
      "嵌套 if-else 做多级判断": "Nested if-else for multi-level decisions",
      "input()获取用户输入与判断": "Using input() for user input and conditions",
      "综合运用循环和条件判断计数": "Combine loops and conditionals for counting",
      "for 循环中的变量递减操作（n = n - 1）": "Variable decrement in for loop (n = n - 1)",
      "循环中用if实现多级判断": "Using if inside loops for multi-level decisions",
      "input()将用户输入存入变量": "Storing user input in variables with input()",
      "循环中的条件统计": "Conditional counting in loops",
      "如果循环5次改成循环3次，会输出什么？": "What would happen if we changed the loop from 5 to 3 times?",
      "在A阶段里用了一个if-else判断及格，现在我们可以用嵌套if-else判断多个等级。": "In stage A we used one if-else to check pass/fail. Now we can use nested if-else for multiple grade levels.",
      "如果用户输入空格怎么办？多输入几个空格后长度会不会变化？": "What if the user enters spaces? Would the length change with extra spaces?",
      "如果不打印'偶'和'奇'，而用一个变量计数，你能计算出有多少个偶数吗？": "Instead of printing 'Even'/'Odd', can you use a counter to count how many even numbers there are?",
      "如果 n=5 改成 n=10，会输出什么？": "What would happen if we changed n=5 to n=10?",
      "除了用 for 循环，还可以用什么循环方式？": "Besides for loops, what other looping methods are there?",
      "如果成绩是59分会走哪个分支？为什么？": "If the score is 59, which branch does it take? Why?",
      "循环配合判断：if 和 for 怎么一起用？": "Combining conditionals with loops: how do if and for work together?",
    };

    if (en.i_stage.summary_points) {
      en.i_stage.summary_points = en.i_stage.summary_points.map(s => translateMap[s] || s);
    }
    if (en.i_stage.question_prompts) {
      en.i_stage.question_prompts = en.i_stage.question_prompts.map(s => translateMap[s] || s);
    }
  }

  // Clear inferred_blocks at root level too
  delete en.inferred_blocks;

  return en;
}

async function main() {
  const cnApi = "http://localhost:3001";
  
  const titles = {
    7: "Task 1: if-else Conditionals",
    8: "Task 2: for Loop Repetition",
    9: "Task 3: Input and Conditionals",
    10: "Task 4: Conditions in Loops",
  };
  const descs = {
    7: "Learn if-else conditional statements, output pass or fail based on score",
    8: "Learn for loops to make the computer repeat actions automatically",
    9: "Learn to use input() to get user input and respond differently based on conditions",
    10: "Combine for loops and if conditionals to classify and count data",
  };
  const mapping = [{ cnId: 7, enId: 1 }, { cnId: 8, enId: 2 }, { cnId: 9, enId: 3 }, { cnId: 10, enId: 4 }];

  const enPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english", waitForConnections: true, connectionLimit: 2 });

  for (const { cnId, enId } of mapping) {
    const cnTask = await fetchJSON(`${cnApi}/api/task/${cnId}`);
    const enContent = translateJson(cnTask.task.content_json);
    const title = titles[cnId];
    const desc = descs[cnId];
    
    console.log(`Updating EN task ${enId}: ${title}`);
    await enPool.query(
      "UPDATE tasks SET title = ?, description = ?, content_json = ? WHERE id = ?",
      [title, desc, JSON.stringify(enContent), enId]
    );
    console.log(`  Done`);
  }

  await enPool.end();
  console.log("All done!");
}

main().catch(console.error);
