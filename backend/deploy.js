const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

(async () => {
  const HOST = "82.156.85.157", USER = "ubuntu", PASS = "wsadqe12!";
  const projDir = path.join(__dirname, "..");
  const frontendDist = path.join(projDir, "frontend", "dist");
  const tmpDir = path.join(projDir, "deploy-final");
  const tarball = path.join(__dirname, "deploy_final.tar.gz");

  console.log("Building package...");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.cpSync(path.join(__dirname, "src"), path.join(tmpDir, "src"), { recursive: true });
  fs.cpSync(path.join(__dirname, "package.json"), path.join(tmpDir, "package.json"));
  fs.cpSync(path.join(__dirname, "tsconfig.json"), path.join(tmpDir, "tsconfig.json"));
  if (fs.existsSync(frontendDist)) fs.cpSync(frontendDist, path.join(tmpDir, "dist"), { recursive: true });
  execSync(`tar -czf "${tarball}" -C "${tmpDir}" .`, { stdio: "pipe" });
  fs.rmSync(tmpDir, { recursive: true });

  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      const run = (cmd, t) => new Promise(res => { conn.exec(cmd, (e, s) => { let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.stderr.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => res(o)); }); });
      try {
        await run("sudo systemctl stop blockpython 2>/dev/null; pkill -f tsx 2>/dev/null; sleep 1; echo STOPPED");
        await run("rm -rf /home/ubuntu/icap/src /home/ubuntu/icap/dist /home/ubuntu/icap/frontend /home/ubuntu/icap/package.json /home/ubuntu/icap/tsconfig.json /home/ubuntu/icap/node_modules /home/ubuntu/icap/package-lock.json 2>/dev/null; mkdir -p /home/ubuntu/icap/frontend; echo CLEANED");
        await new Promise((res, rej) => conn.sftp((e, sftp) => { if (e) rej(e); else sftp.fastPut(tarball, "/home/ubuntu/icap/deploy.tar.gz", {}, e => e ? rej(e) : res()); }));
        console.log("Uploaded");
        await run("cd /home/ubuntu/icap && tar -xzf deploy.tar.gz && rm deploy.tar.gz && mkdir -p frontend && mv dist frontend/dist && echo EXTRACTED");
        await run(`cat > /home/ubuntu/icap/.env << 'EOF'
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=icap
DB_PASSWORD=icap123
DB_NAME=icap_platform_english
TEACHER_USER=admin
TEACHER_PASS=admin123
DEEPSEEK_API_KEY=sk-e6199a4dc0ea4e98b76a70157b1d123e
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
EOF
echo ENV_OK`);
        await run("cd /home/ubuntu/icap && npm install --production 2>&1 | tail -3", 120000);
        await run("sudo systemctl daemon-reload && sudo systemctl reset-failed blockpython 2>/dev/null; sudo systemctl restart blockpython; sleep 10; echo RESTARTED", 30000);
        await run("curl -s http://localhost:3001/api/health || echo DOWN");
        conn.end(); r();
      } catch(e) { console.error(e); conn.end(); r(); }
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 15000, keepaliveInterval: 10000 });
  });
})();
