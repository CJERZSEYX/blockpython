const { Client } = require("ssh2");

function execCmd(conn, cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      let out = "";
      stream.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.on("close", (code) => { clearTimeout(timer); resolve(out); });
    });
  });
}

(async () => {
  const conn = new Client();
  await new Promise((resolve) => {
    conn.on("ready", async () => {
      console.log("=== Database: icap_platform_english ===\n");
      
      console.log("--- Tables ---");
      await execCmd(conn, "mysql -u icap -picap123 icap_platform_english -e 'SHOW TABLES'");
      
      console.log("\n--- Tasks (id, title) ---");
      await execCmd(conn, "mysql -u icap -picap123 icap_platform_english --default-character-set=utf8mb4 -e 'SELECT id, title, sort_order FROM tasks ORDER BY sort_order'");
      
      console.log("\n--- Task 1: a_stage Python code ---");
      await execCmd(conn, "mysql -u icap -picap123 icap_platform_english --default-character-set=utf8mb4 -e \"SELECT JSON_UNQUOTE(JSON_EXTRACT(content_json, '$.a_stage.python_code')) as a_stage_code FROM tasks WHERE id=1\"");
      
      console.log("\n--- Task 1: c_stage title ---");
      await execCmd(conn, "mysql -u icap -picap123 icap_platform_english --default-character-set=utf8mb4 -e \"SELECT JSON_UNQUOTE(JSON_EXTRACT(content_json, '$.c_stage.title')) as c_title FROM tasks WHERE id=1\"");
      
      console.log("\n--- Task 1: p_stage subtasks ---");
      await execCmd(conn, "mysql -u icap -picap123 icap_platform_english --default-character-set=utf8mb4 -e \"SELECT JSON_EXTRACT(content_json, '$.p_stage.subtasks[*].title') as subtask_titles FROM tasks WHERE id=1\"");
      
      console.log("\n--- Task 1: inferred_blocks present? ---");
      await execCmd(conn, "mysql -u icap -picap123 icap_platform_english -e \"SELECT JSON_EXTRACT(content_json, '$.inferred_blocks') IS NOT NULL as has_inferred FROM tasks WHERE id=1\"");
      
      console.log("\n--- Users ---");
      await execCmd(conn, "mysql -u icap -picap123 icap_platform_english -e 'SELECT id, name, role FROM users'");
      
      console.log("\n=== DONE ===");
      conn.end();
      resolve();
    });
    conn.on("error", (e) => { console.error(e.message); resolve(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
