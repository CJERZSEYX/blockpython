const https = require("https");
const http = require("http");

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

function translateText(text) {
  if (!text) return text;
  const map = {
    "任务一：if-else 条件判断": "Task 1: if-else Conditionals",
    "学习 if-else 条件判断，根据成绩输出及格或不及格": "Learn if-else conditionals to output pass or fail based on score",
    "判断成绩等级（嵌套判断）": "Determine Grade Level (Nested if)",
    "根据成绩判断等级：≥90优秀，≥60及格，<60不及格。在A阶段基础上，将else改为另一个if-else。": "Determine the grade level: >=90 Excellent, >=60 Pass, <60 Fail. Replace the else in stage A with another if-else.",
    "优秀": "Excellent",
    "及格": "Pass",
    "不及格": "Fail",

    "任务二：for 循环重复": "Task 2: for Loop Repetition",
    "学习 for 循环，让计算机自动重复执行操作": "Learn for loops to make the computer repeat actions automatically",
    "倒数计数": "Countdown",
    "输出从5倒数到1。用一个变量n=5，循环5次，每次输出n然后让n减1。": "Countdown from 5 to 1. Use a variable n=5, loop 5 times, output n then subtract 1.",
    "编写一个程序，使用for循环让计数器从5倒数到1": "Write a program using a for loop to count down from 5 to 1",
    "循环重复执行后变量递减": "Decrease variable after each loop iteration",

    "任务三：输入与判断": "Task 3: Input and Conditionals",
    "学习用 input() 获取用户输入，并结合条件判断做出不同反应": "Learn to use input() to get user input and use conditionals for different responses",
    "输入名字判断长短": "Check Name Length",
    "输入一个名字n，判断名字长度是否大于1。如果 len(n)>1 则输出n，否则输出0。": "Input a name, check if its length is greater than 3. If len(name)>3 print 'Long name', otherwise print 'Short name'.",
    "编程获取用户输入后，根据名字长度做出不同回应": "Get user input and respond differently based on name length",
    "input()获取用户输入与判断": "Using input() and conditionals",
    "名字很长": "Long name",
    "名字很短": "Short name",

    "任务四：循环里的条件": "Task 4: Conditions in Loops",
    "综合应用 for 循环和 if 条件判断，逐个处理数据并分类输出": "Combine for loops and if conditionals to process and classify data",
    "统计偶数的个数": "Count Even Numbers",
    "循环10次，统计其中偶数的个数。用count变量累加，每次遇到偶数就count+1，最后输出count。": "Loop 10 times and count even numbers. Use a count variable, increment when even, output the final count.",
    "综合运用循环和条件判断计数": "Combine loops and conditionals for counting",
    "循环中的条件统计": "Conditional counting in loops",
  };
  
  // Try exact match first
  if (map[text]) return map[text];
  return text;
}

function translateTask(cnTask) {
  const t = cnTask.task;
  return {
    title: translateText(t.title),
    description: translateText(t.description),
    content_json: {
      a_stage: t.content_json.a_stage,
      c_stage: {
        ...t.content_json.c_stage,
        title: translateText(t.content_json.c_stage.title),
        description: translateText(t.content_json.c_stage.description || ""),
        blocks_xml: t.content_json.c_stage.blocks_xml
          ? t.content_json.c_stage.blocks_xml
              .replace(/优秀/g, "Excellent")
              .replace(/及格"/g, 'Pass"')
              .replace(/不及格"/g, 'Fail"')
              .replace(/名字很长/g, "Long name")
              .replace(/名字很短/g, "Short name")
          : undefined,
        inferred_blocks: undefined,
      },
      i_stage: t.content_json.i_stage ? {
        summary_points: (t.content_json.i_stage.summary_points || []).map(translateText),
        question_prompts: (t.content_json.i_stage.question_prompts || []).map(translateText),
      } : undefined,
    },
  };
}

async function updateTask(baseUrl, taskId, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/teacher/tasks/${taskId}`, baseUrl);
    const body = JSON.stringify(data);
    const client = baseUrl.startsWith("https") ? https : http;
    const req = client.request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-session-token": token },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function loginTeacher(baseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/auth/login", baseUrl);
    const body = JSON.stringify({ student_id: "admin", password: "admin123", role: "teacher" });
    const client = baseUrl.startsWith("https") ? https : http;
    const req = client.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const data = JSON.parse(d);
        resolve(data.session_id);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const cnApi = "http://localhost:3001";
  const enApi = "http://localhost:3002";

  const token = await loginTeacher(enApi);
  console.log("Logged in, token:", token.substring(0, 8) + "...");

  const mapping = [
    { cnId: 7, enId: 1 },
    { cnId: 8, enId: 2 },
    { cnId: 9, enId: 3 },
    { cnId: 10, enId: 4 },
  ];

  for (const { cnId, enId } of mapping) {
    const cnTask = await fetchJSON(`${cnApi}/api/task/${cnId}`);
    const enData = translateTask(cnTask);
    console.log(`Updating task ${enId}: ${enData.title}`);
    const result = await updateTask(enApi, enId, enData, token);
    console.log(`  Result: ${JSON.stringify(result)}`);
  }
  console.log("Done!");
}

main().catch(console.error);
