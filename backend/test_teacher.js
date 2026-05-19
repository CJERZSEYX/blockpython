const http = require("http");
const https = require("https");

function apiPost(url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === "https:" ? https : http;
    const options = { hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "Content-Type": "application/json", "x-session-token": token } };
    const req = client.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d, status: res.statusCode }); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function apiGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === "https:" ? https : http;
    const options = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "GET", headers: { "x-session-token": token } };
    const req = client.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d, status: res.statusCode }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function apiPut(url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === "https:" ? https : http;
    const options = { hostname: u.hostname, port: u.port, path: u.pathname, method: "PUT", headers: { "Content-Type": "application/json", "x-session-token": token } };
    const req = client.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d, status: res.statusCode }); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function testAll(name, baseUrl, token) {
  console.log(`\n=== ${name} ===`);
  
  // 1. Dashboard stats
  try { const r = await apiGet(`${baseUrl}/api/teacher/stats`, token); console.log(`  stats: students=${r.totalStudents} active=${r.activeStudents}`); } catch(e) { console.log(`  stats: FAILED ${e.message}`); }

  // 2. Student list
  try { const r = await apiGet(`${baseUrl}/api/teacher/students`, token); console.log(`  students list: ${r.students?.length || 0} students`); } catch(e) { console.log(`  students: FAILED ${e.message}`); }

  // 3. Task list (student API)
  try { const r = await apiGet(`${baseUrl}/api/task/list`, token); console.log(`  tasks list: ${r.tasks?.length || 0} tasks`); } catch(e) { console.log(`  tasks: FAILED ${e.message}`); }

  // 4. Task detail
  try { const r = await apiGet(`${baseUrl}/api/task/1`, token); console.log(`  task 1 detail: ${r.task?.title}`); } catch(e) { console.log(`  task detail: FAILED ${e.message}`); }

  // 5. Update task title (test edit)
  try {
    const orig = await apiGet(`${baseUrl}/api/task/1`, token);
    const origTitle = orig.task.title;
    const r = await apiPut(`${baseUrl}/api/teacher/tasks/1`, { title: origTitle + " [TEST]", description: orig.task.description }, token);
    console.log(`  task edit title: ${r.success ? "OK" : r.error}`);
    // Restore
    await apiPut(`${baseUrl}/api/teacher/tasks/1`, { title: origTitle, description: orig.task.description }, token);
    console.log(`  task restore title: OK`);
  } catch(e) { console.log(`  task edit: FAILED ${e.message}`); }

  // 6. Get prompts
  try { const r = await apiGet(`${baseUrl}/api/teacher/prompts`, token); console.log(`  prompts: stages=${Object.keys(r.prompts || {}).join(",")}`); } catch(e) { console.log(`  prompts: FAILED ${e.message}`); }

  // 7. Edit prompt
  try {
    const r = await apiPut(`${baseUrl}/api/teacher/prompts`, { stage: "P", content: "TEST PROMPT" }, token);
    console.log(`  prompt edit P: ${r.success ? "OK" : r.error}`);
    // Restore
    await apiPut(`${baseUrl}/api/teacher/prompts`, { stage: "P", content: "You are a programming teacher. Break down Python code into blocks and explain." }, token);
    console.log(`  prompt restore: OK`);
  } catch(e) { console.log(`  prompt edit: FAILED ${e.message}`); }

  // 8. System prompts (block names)
  try { const r = await apiGet(`${baseUrl}/api/teacher/system-prompts`, token); console.log(`  block names: length=${r.blockNames?.length || 0}`); } catch(e) { console.log(`  block names: FAILED ${e.message}`); }

  // 9. Recent actions
  try { const r = await apiGet(`${baseUrl}/api/teacher/recent-actions`, token); console.log(`  recent actions: ${r.actions?.length || 0}`); } catch(e) { console.log(`  recent actions: FAILED ${e.message}`); }

  // 10. Charts
  try { const r = await apiGet(`${baseUrl}/api/teacher/stats/charts`, token); console.log(`  charts: stageTime=${r.stageTime?.length || 0} stageActions=${r.stageActions?.length || 0}`); } catch(e) { console.log(`  charts: FAILED ${e.message}`); }

  // 11. Preview blocks
  try { const r = await apiPost(`${baseUrl}/api/teacher/preview-blocks`, { code: "print('hello')" }, token); console.log(`  preview blocks: ${Object.keys(r.blocks || {}).length} block types`); } catch(e) { console.log(`  preview blocks: FAILED ${e.message}`); }

  // 12. Preview blocks XML
  try { const r = await apiPost(`${baseUrl}/api/teacher/preview-blocks-xml`, { code: "print('hello')" }, token); console.log(`  preview XML: length=${r.xml?.length || 0}`); } catch(e) { console.log(`  preview XML: FAILED ${e.message}`); }
}

async function main() {
  await testAll("CN (port 3001)", "http://localhost:3001", "3d5b159c-a8a4-4ecd-ac3c-b3187e4bf362");
  await testAll("EN (port 3002)", "http://localhost:3002", "efb05f80-771b-46c5-8b11-2fe552dc712d");
  console.log("\n=== COMPLETE ===");
}

main().catch(console.error);
