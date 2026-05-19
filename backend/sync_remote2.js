const mysql = require("mysql2/promise");
const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");

async function main() {
  // Read local translated tasks
  const localPool = mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });
  const [localTasks] = await localPool.query("SELECT id, title, description, content_json FROM tasks ORDER BY id");

  // Generate SQL file (using mysql2 escape)
  let sql = "USE icap_platform_english;\n";
  for (const task of localTasks) {
    const escapedTitle = localPool.escape(task.title);
    const escapedDesc = localPool.escape(task.description || "");
    const escapedJson = localPool.escape(JSON.stringify(task.content_json));
    sql += `UPDATE tasks SET title=${escapedTitle}, description=${escapedDesc}, content_json=${escapedJson} WHERE id=${task.id};\n`;
  }
  await localPool.end();

  const sqlFile = path.join(__dirname, "remote_update.sql");
  fs.writeFileSync(sqlFile, sql);
  console.log(`SQL file: ${sqlFile} (${fs.statSync(sqlFile).size} bytes)`);

  // Upload and execute
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on("ready", async () => {
      try {
        console.log("Uploading update SQL...");
        await new Promise((res, rej) => {
          conn.sftp((err, sftp) => {
            if (err) rej(err);
            else sftp.fastPut(sqlFile, "/tmp/update_tasks.sql", {}, (err) => {
              if (err) rej(err);
              else { console.log("Uploaded"); res(); }
            });
          });
        });

        console.log("Executing SQL...");
        await new Promise((res) => {
          conn.exec("mysql -u icap -picap123 < /tmp/update_tasks.sql 2>&1 && echo OK", (err, stream) => {
            let o = "";
            stream.on("data", d => { o += d; process.stdout.write(d); });
            stream.stderr.on("data", d => { o += d; process.stdout.write(d); });
            stream.on("close", () => { console.log("\n" + o.trim()); res(); });
          });
        });

        // Trigger inference
        console.log("\nRe-inferring blocks...");
        await new Promise((res) => {
          conn.exec("for i in 1 2 3 4; do curl -s -X POST http://localhost:3001/api/task/infer/$i > /dev/null; done; echo Done", (err, stream) => {
            let o = ""; stream.on("data", d => o += d); stream.on("close", () => { console.log(o.trim()); res(); });
          });
        });

        // Verify
        console.log("\nVerifying...");
        await new Promise((res) => {
          conn.exec("curl -s http://localhost:3001/api/task/list | python3 -c \"import sys,json; [print(f'{t[\\\"id\\\"]}. {t[\\\"title\\\"]}') for t in json.load(sys.stdin)['tasks']]\"", (err, stream) => {
            let o = ""; stream.on("data", d => { o += d; process.stdout.write(d); }); stream.on("close", () => res());
          });
        });

        console.log("\nDone! http://82.156.85.157:3001");
        conn.end();
        resolve();
      } catch(e) { console.error(e.message); conn.end(); resolve(); }
    });
    conn.on("error", e => { console.error(e.message); resolve(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
}

main().catch(console.error);
