const { Client } = require("ssh2");

const HOST = "82.156.85.157";
const USER = "ubuntu";
const PASS = "wsadqe12!";

function execCmd(conn, cmd, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      let out = "";
      stream.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.on("close", (code) => { clearTimeout(timer); resolve({ code, output: out }); });
    });
  });
}

async function main() {
  const conn = new Client();
  
  await new Promise((resolve, reject) => {
    conn.on("ready", async () => {
      try {
        // Check MySQL root access
        console.log("=== Checking MySQL ===");
        
        // Try sudo mysql (root without password)
        await execCmd(conn, "sudo mysql -e 'SELECT 1' 2>&1", 10000);
        
        // Create database with sudo
        console.log("\n=== Creating database ===");
        await execCmd(conn, "sudo mysql -e \"CREATE DATABASE IF NOT EXISTS icap_platform_english DEFAULT CHARSET utf8mb4\" 2>&1 && echo 'DB CREATED'", 10000);
        
        // Grant icap user access
        console.log("\n=== Granting permissions ===");
        await execCmd(conn, "sudo mysql -e \"GRANT ALL PRIVILEGES ON icap_platform_english.* TO 'icap'@'localhost'\" 2>&1 && echo 'GRANTED'", 10000);
        await execCmd(conn, "sudo mysql -e \"FLUSH PRIVILEGES\" 2>&1 && echo 'FLUSHED'", 10000);
        
        // Verify access
        console.log("\n=== Verifying access ===");
        await execCmd(conn, "mysql -u icap -picap123 icap_platform_english -e 'SELECT 1' 2>&1 && echo 'ACCESS OK'", 10000);
        
        // Now seed the database
        console.log("\n=== Seeding tasks ===");
        await execCmd(conn, "if [ -f /tmp/seed_english.sql ]; then mysql -u icap -picap123 icap_platform_english < /tmp/seed_english.sql 2>&1 && echo 'SEED OK'; else echo 'No seed file'; fi", 30000);
        
        // Add admin user
        await execCmd(conn, "mysql -u icap -picap123 icap_platform_english -e \"INSERT INTO users (id, name, role) VALUES ('admin', 'Teacher', 'teacher') ON DUPLICATE KEY UPDATE role='teacher'\" 2>&1 && echo 'ADMIN OK'", 10000);
        
        // Restart service
        console.log("\n=== Restarting service ===");
        await execCmd(conn, "sudo pkill -f 'tsx.*index' 2>/dev/null || true; sleep 2", 10000);
        await execCmd(conn, "cd /home/ubuntu/icap && sudo nohup npx tsx src/index.ts > /tmp/icap.log 2>&1 & sleep 8 && echo 'RESTARTED'", 30000);
        
        // Check log
        console.log("\n=== Server log ===");
        await execCmd(conn, "tail -20 /tmp/icap.log 2>/dev/null", 10000);
        
        // Health check
        console.log("\n=== Health check ===");
        await execCmd(conn, "curl -s http://localhost:3001/api/health 2>/dev/null || echo 'FAILED'", 10000);
        
        // Task list
        console.log("\n=== Task list ===");
        await execCmd(conn, "curl -s http://localhost:3001/api/task/list 2>/dev/null | python3 -m json.tool 2>/dev/null | head -20", 10000);
        
        console.log("\n=== DONE ===");
        console.log("URL: http://82.156.85.157:3001");
        
        conn.end();
        resolve();
      } catch(e) {
        console.error("ERROR:", e.message);
        conn.end();
        reject(e);
      }
    });
    
    conn.on("error", e => { console.error("Connection error:", e.message); reject(e); });
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
  });
}

main().catch(() => process.exit(1));
