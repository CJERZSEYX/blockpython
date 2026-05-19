// Upload-only deployment script
const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");

const HOST = "82.156.85.157";
const USER = "ubuntu";
const PASS = "wsadqe12!";
const REMOTE_DIR = "/home/ubuntu/icap";
const TARBALL = path.join(__dirname, "deploy.tar.gz");

function execCmd(conn, cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      let out = "";
      stream.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, output: out });
      });
    });
  });
}

function upload(conn, localFile, remoteFile) {
  return new Promise((resolve, reject) => {
    console.log(`  Uploading ${path.basename(localFile)} (${(fs.statSync(localFile).size/1024).toFixed(0)} KB)...`);
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      sftp.fastPut(localFile, remoteFile, {}, (err) => {
        if (err) reject(err);
        else { console.log("  Upload OK"); resolve(); }
      });
    });
  });
}

async function main() {
  console.log("=== ICAP English Deployment ===\n");
  
  const conn = new Client();
  
  await new Promise((resolve, reject) => {
    conn.on("ready", async () => {
      try {
        // 1. Stop + clean
        console.log("1. Stopping old service...");
        await execCmd(conn, "sudo pkill -f 'tsx.*index' 2>/dev/null || true; sleep 1; echo DONE\n");
        
        console.log("2. Cleaning old files...");
        await execCmd(conn, `sudo rm -rf ${REMOTE_DIR} 2>/dev/null || true; mkdir -p ${REMOTE_DIR}; echo DONE\n`);
        
        // 3. Upload
        console.log("3. Uploading package...");
        await upload(conn, TARBALL, `${REMOTE_DIR}/deploy.tar.gz`);
        
        // 4. Extract + install
        console.log("4. Extracting and installing...");
        await execCmd(conn, `cd ${REMOTE_DIR} && tar -xzf deploy.tar.gz && rm deploy.tar.gz && echo 'Extracted'`, 30000);
        
        // Write .env
        const envContent = `PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=icap
DB_PASSWORD=icap123
DB_NAME=icap_platform_english
TEACHER_USER=admin
TEACHER_PASS=admin123
DEEPSEEK_API_KEY=sk-e6199a4dc0ea4e98b76a70157b1d123e
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
`;
        await execCmd(conn, `cat > ${REMOTE_DIR}/.env << 'ENVEOF'\n${envContent}\nENVEOF\necho '.env written'`);
        
        // Install dependencies
        console.log("5. Installing npm dependencies (may take a while)...");
        await execCmd(conn, `cd ${REMOTE_DIR} && npm install --production 2>&1`, 180000);
        
        // 6. Database setup
        console.log("6. Setting up database...");
        await execCmd(conn, "mysql -u icap -picap123 -e \"CREATE DATABASE IF NOT EXISTS icap_platform_english DEFAULT CHARSET utf8mb4\" 2>&1 && echo 'DB OK'");
        
        // Tables are created on first start
        
        // 7. Start service
        console.log("7. Starting service...");
        await execCmd(conn, `cd ${REMOTE_DIR} && sudo nohup npx tsx src/index.ts > /tmp/icap.log 2>&1 & sleep 1 && echo 'Started'`, 15000);
        
        // 8. Wait for init
        console.log("8. Waiting for server to initialize...");
        await new Promise(r => setTimeout(r, 12000));
        
        // 9. Check log
        console.log("9. Server log:");
        await execCmd(conn, "tail -15 /tmp/icap.log 2>/dev/null", 10000);
        
        // 10. Seed tasks
        console.log("10. Seeding tasks...");
        const seedFile = path.join(__dirname, "src", "config", "seed_english.sql");
        if (fs.existsSync(seedFile)) {
          console.log("  Seed file found locally, uploading...");
          await upload(conn, seedFile, "/tmp/seed_english.sql");
          await execCmd(conn, "mysql -u icap -picap123 icap_platform_english < /tmp/seed_english.sql 2>&1 && echo 'Seed OK'", 30000);
        }
        
        // Also ensure admin user
        await execCmd(conn, "mysql -u icap -picap123 icap_platform_english -e \"INSERT INTO users (id, name, role) VALUES ('admin', 'Teacher', 'teacher') ON DUPLICATE KEY UPDATE role='teacher'\" 2>&1 && echo 'Admin OK'");
        
        // 11. Health check
        console.log("\n11. Health check...");
        await execCmd(conn, "curl -s http://localhost:3001/api/health 2>/dev/null || echo 'NOT READY'", 10000);
        await execCmd(conn, "curl -s http://localhost:3001/api/task/list 2>/dev/null | head -c 300", 10000);
        
        console.log("\n=== DONE ===");
        console.log(`URL: http://${HOST}:3001`);
        
        conn.end();
        resolve();
        
      } catch(e) {
        console.error("ERROR:", e.message);
        conn.end();
        reject(e);
      }
    });
    
    conn.on("error", (e) => { console.error("Connection error:", e.message); reject(e); });
    
    conn.connect({
      host: HOST, port: 22, username: USER, password: PASS,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
    });
  });
  
  console.log("\nDeployment finished.");
}

main().catch(() => process.exit(1));
