const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

(async () => {
  const HOST = "82.156.85.157";
  const USER = "ubuntu";
  const PASS = "wsadqe12!";

  // Step 1: Create deployment package
  console.log("=== 1. Creating deploy package ===");
  const backendDir = __dirname;
  const projDir = path.join(backendDir, "..");
  const frontendDist = path.join(projDir, "frontend", "dist");
  
  const tmpDir = path.join(projDir, "deploy-final");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  
  fs.cpSync(path.join(backendDir, "src"), path.join(tmpDir, "src"), { recursive: true });
  fs.cpSync(path.join(backendDir, "package.json"), path.join(tmpDir, "package.json"));
  fs.cpSync(path.join(backendDir, "tsconfig.json"), path.join(tmpDir, "tsconfig.json"));
  fs.cpSync(frontendDist, path.join(tmpDir, "dist"), { recursive: true });
  
  const tarball = path.join(backendDir, "deploy_final.tar.gz");
  execSync(`tar -czf "${tarball}" -C "${tmpDir}" .`, { stdio: "pipe" });
  fs.rmSync(tmpDir, { recursive: true });
  console.log(`Package: ${(fs.statSync(tarball).size/1024).toFixed(0)} KB`);

  // Step 2: Connect and deploy
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      try {
        // Stop old
        console.log("\n=== 2. Stopping old service ===");
        await exec(conn, "pkill -f 'tsx.*index' 2>/dev/null; sleep 2; echo STOPPED");
        
        // Clean old files
        console.log("=== 3. Cleaning old files ===");
        await exec(conn, "rm -rf /home/ubuntu/icap/src /home/ubuntu/icap/dist /home/ubuntu/icap/frontend /home/ubuntu/icap/package.json /home/ubuntu/icap/tsconfig.json /home/ubuntu/icap/node_modules /home/ubuntu/icap/package-lock.json /home/ubuntu/icap/*.html /home/ubuntu/icap/assets /home/ubuntu/icap/*.svg 2>/dev/null; mkdir -p /home/ubuntu/icap/frontend; echo CLEANED");
        
        // Upload
        console.log("=== 4. Uploading ===");
        await upload(conn, tarball, "/home/ubuntu/icap/deploy.tar.gz");
        
        // Extract
        console.log("=== 5. Extracting ===");
        await exec(conn, "cd /home/ubuntu/icap && tar -xzf deploy.tar.gz && rm deploy.tar.gz && mkdir -p frontend && mv dist frontend/dist && echo EXTRACTED", 30000);
        
        // Write .env
        console.log("=== 6. Writing .env ===");
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
        await exec(conn, `cat > /home/ubuntu/icap/.env << 'EOF'
${envContent}
EOF
echo ENV_OK`);
        
        // npm install
        console.log("=== 7. Installing deps ===");
        await exec(conn, "cd /home/ubuntu/icap && npm install --production 2>&1 | tail -5", 120000);
        
        // Clean up redundant databases
        console.log("=== 8. Cleaning databases ===");
        await exec(conn, "sudo mysql -e \"DROP DATABASE IF EXISTS icap_platform\" 2>&1; sudo mysql -e \"SHOW DATABASES\" 2>&1 | grep -E 'icap|Database'");
        
        // Remove old backup files
        console.log("=== 9. Removing old backups ===");
        await exec(conn, "rm -f /home/ubuntu/icap_dump.sql /home/ubuntu/icap_full.sql /home/ubuntu/icap_tasks.sql /home/ubuntu/deploy.zip /home/ubuntu/icap/seed.sql /tmp/seed_english.sql; rm -rf /home/ubuntu/backend 2>/dev/null; echo CLEANED");
        
        // Start service
        console.log("=== 10. Starting service ===");
        await exec(conn, "cd /home/ubuntu/icap && nohup npx tsx src/index.ts > /tmp/icap.log 2>&1 & echo PID=$!; sleep 12; echo READY", 30000);
        
        // Health check
        console.log("=== 11. Verification ===");
        await exec(conn, "curl -s http://localhost:3001/api/health");
        console.log();
        await exec(conn, "curl -s http://localhost:3001/api/task/list | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(f'{t[\\\"id\\\"]}. {t[\\\"title\\\"]}') for t in d['tasks']]\"");
        await exec(conn, "head -2 /home/ubuntu/icap/frontend/dist/index.html");
        
        console.log("\n=== DONE ===");
        console.log("http://82.156.85.157:3001");
        conn.end();
        r();
      } catch(e) { console.error("ERROR:", e.message); conn.end(); r(); }
    });
    conn.on("error", e => { console.error(e.message); r(); });
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000, keepaliveInterval: 10000 });
  });
})();

function exec(conn, cmd, timeout = 30000) {
  return new Promise(res => {
    const t = setTimeout(() => res(), timeout);
    conn.exec(cmd, (e, s) => {
      let o = "";
      s.on("data", d => { o += d; process.stdout.write(d); });
      s.stderr.on("data", d => { o += d; process.stdout.write(d); });
      s.on("close", () => { clearTimeout(t); res(o); });
    });
  });
}

function upload(conn, local, remote) {
  return new Promise((res, rej) => {
    conn.sftp((e, sftp) => {
      if (e) rej(e);
      else sftp.fastPut(local, remote, {}, e => e ? rej(e) : res());
    });
  });
}
