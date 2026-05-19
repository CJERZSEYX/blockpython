const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

(async () => {
  const HOST = "82.156.85.157";
  const USER = "ubuntu";
  const PASS = "wsadqe12!";

  const tmpDir = path.join(__dirname, "..", "dist-tmp");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const frontendDist = path.join(__dirname, "..", "frontend", "dist");
  fs.cpSync(frontendDist, tmpDir, { recursive: true });

  const tarball = path.join(__dirname, "dist_fix.tar.gz");
  execSync(`tar -czf "${tarball}" -C "${tmpDir}" .`, { stdio: "pipe" });
  fs.rmSync(tmpDir, { recursive: true });

  console.log(`Dist package: ${(fs.statSync(tarball).size/1024).toFixed(0)} KB`);

  const conn = new Client();
  await new Promise((resolve) => {
    conn.on("ready", async () => {
      try {
        console.log("Uploading...");
        await new Promise((res, rej) => {
          conn.sftp((err, sftp) => {
            if (err) rej(err);
            else sftp.fastPut(tarball, "/home/ubuntu/icap/dist_fix.tar.gz", {}, (err) => {
              if (err) rej(err);
              else { console.log("  OK"); res(); }
            });
          });
        });

        console.log("Replacing dist...");
        await new Promise((res) => {
          conn.exec("cd /home/ubuntu/icap && rm -rf dist && tar -xzf dist_fix.tar.gz && rm dist_fix.tar.gz && echo OK", (err, stream) => {
            let o = ""; stream.on("data", d => { o += d; process.stdout.write(d); });
            stream.on("close", () => { console.log("\n" + o.trim()); res(); });
          });
        });

        console.log("Restarting...");
        await new Promise((res) => {
          conn.exec("sudo pkill -f 'tsx.*index' 2>/dev/null || true; sleep 2; cd /home/ubuntu/icap && sudo nohup npx tsx src/index.ts > /tmp/icap.log 2>&1 & sleep 6 && echo RESTARTED", (err, stream) => {
            let o = ""; stream.on("data", d => { o += d; process.stdout.write(d); });
            stream.on("close", () => { console.log(o.trim()); res(); });
          });
        });

        console.log("Verifying...");
        await new Promise((res) => {
          conn.exec("curl -s http://localhost:3001/api/health && echo '' && head -1 /home/ubuntu/icap/dist/index.html", (err, stream) => {
            let o = ""; stream.on("data", d => { o += d; process.stdout.write(d); });
            stream.on("close", () => { console.log("\nDone! http://82.156.85.157:3001"); res(); });
          });
        });

        conn.end();
        resolve();
      } catch(e) { console.error(e); conn.end(); resolve(); }
    });
    conn.on("error", e => { console.error(e.message); resolve(); });
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 15000 });
  });
})();
