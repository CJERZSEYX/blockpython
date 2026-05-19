// Step-by-step deployment using ssh2
const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");

const HOST = "82.156.85.157";
const USER = "ubuntu";
const PASS = "wsadqe12!";
const REMOTE_DIR = "/home/ubuntu/icap";

function sshExec(conn, cmd, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout: " + cmd)), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      let out = "", errOut = "";
      stream.on("data", (d) => { out += d.toString(); });
      stream.stderr.on("data", (d) => { errOut += d.toString(); });
      stream.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout: out, stderr: errOut });
      });
    });
  });
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) { reject(err); return; }
        resolve();
      });
    });
  });
}

async function deploy() {
  // Step 1: Create package
  console.log("=== Step 1: Creating deployment package ===");
  
  const pkgDir = path.join(__dirname, "..", "deploy-pkg");
  if (fs.existsSync(pkgDir)) fs.rmSync(pkgDir, { recursive: true });
  fs.mkdirSync(pkgDir, { recursive: true });
  
  // .env for remote server
  fs.writeFileSync(path.join(pkgDir, ".env"), `PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=icap
DB_PASSWORD=icap123
DB_NAME=icap_platform_english
TEACHER_USER=admin
TEACHER_PASS=admin123
DEEPSEEK_API_KEY=sk-e6199a4dc0ea4e98b76a70157b1d123e
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
`);
  
  const backendSrc = path.join(__dirname, "..");
  const frontendDist = path.join(backendSrc, "..", "frontend", "dist");
  
  // Copy files
  fs.cpSync(path.join(backendSrc, "src"), path.join(pkgDir, "src"), { recursive: true });
  fs.cpSync(path.join(backendSrc, "package.json"), path.join(pkgDir, "package.json"));
  fs.cpSync(path.join(backendSrc, "tsconfig.json"), path.join(pkgDir, "tsconfig.json"));
  fs.cpSync(frontendDist, path.join(pkgDir, "dist"), { recursive: true });
  
  // Also include seed SQL
  const seedPath = path.join(backendSrc, "src", "config", "seed_english.sql");
  if (fs.existsSync(seedPath)) {
    fs.cpSync(seedPath, path.join(pkgDir, "seed.sql"));
    console.log("  Seed SQL included");
  }
  
  const tarball = path.join(__dirname, "deploy.tar.gz");
  require("child_process").execSync(`tar -czf "${tarball}" -C "${pkgDir}" .`, { stdio: "pipe" });
  fs.rmSync(pkgDir, { recursive: true });
  
  const size = (fs.statSync(tarball).size / 1024).toFixed(0);
  console.log(`  Package: ${tarball} (${size} KB)`);
  
  // Step 2: Connect and deploy
  console.log("\n=== Step 2: Connecting to server ===");
  
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on("ready", async () => {
      console.log("  Connected!");
      try {
        // Stop old service
        console.log("\n=== Step 3: Stopping old service ===");
        let r = await sshExec(conn, "sudo pkill -f 'tsx.*index.ts' 2>/dev/null || true; sudo pkill -f 'node.*index.js' 2>/dev/null || true; sleep 2; echo 'stopped'");
        console.log("  " + r.stdout.trim());
        
        // Clean old directory
        console.log("\n=== Step 4: Cleaning old files ===");
        r = await sshExec(conn, `sudo rm -rf ${REMOTE_DIR} 2>/dev/null || true; mkdir -p ${REMOTE_DIR}; echo 'cleaned'`);
        console.log("  " + r.stdout.trim());
        
        // Upload package
        console.log("\n=== Step 5: Uploading package ===");
        await sftpPut(conn, tarball, `${REMOTE_DIR}/deploy.tar.gz`);
        console.log("  Upload complete");
        
        // Extract and install
        console.log("\n=== Step 6: Extracting and installing ===");
        r = await sshExec(conn, `cd ${REMOTE_DIR} && tar -xzf deploy.tar.gz && rm deploy.tar.gz && npm install --production 2>&1`, 120000);
        console.log("  npm install: " + (r.stdout + r.stderr).substring(0, 200));
        
        // Setup database
        console.log("\n=== Step 7: Setting up database ===");
        r = await sshExec(conn, `mysql -u icap -picap123 -e "CREATE DATABASE IF NOT EXISTS icap_platform_english DEFAULT CHARSET utf8mb4" 2>&1 && echo 'DB created'`);
        console.log("  " + r.stdout.trim());
        
        // Seed if seed.sql exists
        r = await sshExec(conn, `if [ -f ${REMOTE_DIR}/seed.sql ]; then mysql -u icap -picap123 icap_platform_english < ${REMOTE_DIR}/seed.sql 2>&1 && echo 'Seeded'; else echo 'No seed file'; fi`);
        console.log("  " + r.stdout.trim());
        
        // Ensure admin user exists
        r = await sshExec(conn, `mysql -u icap -picap123 icap_platform_english -e "INSERT INTO users (id, name, role) VALUES ('admin', 'Teacher', 'teacher') ON DUPLICATE KEY UPDATE role='teacher'" 2>&1 && echo 'Admin OK'`);
        console.log("  " + r.stdout.trim());
        
        // Start service
        console.log("\n=== Step 8: Starting service ===");
        r = await sshExec(conn, `cd ${REMOTE_DIR} && sudo nohup npx tsx src/index.ts > /tmp/icap.log 2>&1 & sleep 5 && echo 'Started'`, 60000);
        console.log("  " + r.stdout.trim());
        
        // Check log
        r = await sshExec(conn, "tail -20 /tmp/icap.log 2>/dev/null");
        console.log("  Server log:\n" + r.stdout.trim().split("\n").slice(-5).join("\n"));
        
        // Health check
        console.log("\n=== Step 9: Health check ===");
        r = await sshExec(conn, "curl -s http://localhost:3001/api/health 2>/dev/null || echo 'FAILED'");
        console.log("  " + r.stdout.trim());
        
        // Test task list
        r = await sshExec(conn, "curl -s http://localhost:3001/api/task/list 2>/dev/null | head -c 200");
        console.log("  Task list: " + r.stdout.trim().substring(0, 150));
        
        conn.end();
        console.log("\n========================================");
        console.log("  DEPLOYMENT COMPLETE");
        console.log("  URL: http://" + HOST + ":3001");
        console.log("========================================");
        resolve();
      } catch(e) {
        console.error("ERROR:", e.message);
        conn.end();
        reject(e);
      }
    });
    
    conn.on("error", (err) => {
      console.error("Connection failed:", err.message);
      reject(err);
    });
    
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
  });
}

deploy().catch(() => process.exit(1));
