const mysql = require("mysql2/promise");
const { Client } = require("ssh2");

async function main() {
  // Read local translated tasks
  const localPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });
  const [localTasks] = await localPool.query("SELECT id, title, description, content_json FROM tasks ORDER BY id");
  await localPool.end();

  // Connect to remote and update
  const conn = new Client();
  
  await new Promise((resolve, reject) => {
    conn.on("ready", async () => {
      try {
        // Build SQL updates
        for (const task of localTasks) {
          const json = JSON.stringify(task.content_json).replace(/'/g, "'\\''");
          const title = task.title.replace(/'/g, "'\\''");
          const desc = (task.description || "").replace(/'/g, "'\\''");
          
          const sql = `UPDATE tasks SET title='${title}', description='${desc}', content_json='${json}' WHERE id=${task.id};`;
          
          await new Promise((res, rej) => {
            conn.exec(`mysql -u icap -picap123 icap_platform_english -e "${sql.replace(/"/g, '\\"')}" 2>&1`, (err, stream) => {
              let out = "";
              stream.on("data", (d) => out += d);
              stream.stderr.on("data", (d) => out += d);
              stream.on("close", (code) => {
                if (out.includes("ERROR")) console.log(`  Task ${task.id}: ERROR - ${out.trim()}`);
                else console.log(`  Task ${task.id}: OK -> ${task.title}`);
                res();
              });
            });
          });
        }
        
        // Re-trigger inference
        console.log("\nTriggering re-inference...");
        await new Promise((res) => {
          conn.exec("curl -s -X POST http://localhost:3001/api/task/infer/1 > /dev/null; curl -s -X POST http://localhost:3001/api/task/infer/2 > /dev/null; curl -s -X POST http://localhost:3001/api/task/infer/3 > /dev/null; curl -s -X POST http://localhost:3001/api/task/infer/4 > /dev/null; echo done", (err, stream) => {
            let o = ""; stream.on("data", d => o += d);
            stream.on("close", () => { console.log("  " + o.trim()); res(); });
          });
        });
        
        console.log("\nDone! http://82.156.85.157:3001");
        conn.end();
        resolve();
      } catch(e) { console.error(e); conn.end(); resolve(); }
    });
    conn.on("error", e => { console.error(e.message); resolve(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
}

main().catch(console.error);
