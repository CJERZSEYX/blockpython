const { Client } = require("ssh2");

function execCmd(conn, cmd, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); resolve("ERROR:" + err.message); return; }
      let out = "";
      stream.on("data", (d) => { out += d; });
      stream.stderr.on("data", (d) => { out += d; });
      stream.on("close", (code) => { clearTimeout(timer); resolve(out); });
    });
  });
}

(async () => {
  const conn = new Client();
  await new Promise((resolve) => {
    conn.on("ready", async () => {
      console.log("=== 1. What's running on port 3001? ===");
      console.log(await execCmd(conn, "sudo lsof -i :3001 2>/dev/null || sudo ss -tlnp | grep 3001"));
      
      console.log("\n=== 2. Current processes ===");
      console.log(await execCmd(conn, "ps aux | grep -E 'tsx|node' | grep -v grep"));
      
      console.log("\n=== 3. What's in /home/ubuntu/icap? ===");
      console.log(await execCmd(conn, "ls -la /home/ubuntu/icap/ 2>/dev/null"));
      
      console.log("\n=== 4. What .env is being used? ===");
      console.log(await execCmd(conn, "cat /home/ubuntu/icap/.env 2>/dev/null"));
      
      console.log("\n=== 5. Other deployment directories? ===");
      console.log(await execCmd(conn, "ls -la /home/ubuntu/ 2>/dev/null | grep -E 'icap|www|html'"));
      
      console.log("\n=== 6. Nginx or proxy? ===");
      console.log(await execCmd(conn, "which nginx 2>/dev/null; cat /etc/nginx/sites-enabled/default 2>/dev/null | head -30"));
      
      console.log("\n=== 7. Curl test from server itself ===");
      console.log(await execCmd(conn, "curl -s http://localhost:3001/api/task/list | head -c 300"));
      
      console.log("\n=== 8. What dist is being served? ===");
      console.log(await execCmd(conn, "ls /home/ubuntu/icap/dist/index.html 2>/dev/null && head -5 /home/ubuntu/icap/dist/index.html"));
      
      console.log("\n=== 9. Check if old icap dir exists elsewhere ===");
      console.log(await execCmd(conn, "find /home/ubuntu -name 'index.ts' -path '*/src/*' 2>/dev/null | head -5"));
      
      console.log("\n=== 10. Service log ===");
      console.log(await execCmd(conn, "tail -30 /tmp/icap.log 2>/dev/null"));

      conn.end();
      resolve();
    });
    conn.on("error", (e) => { console.error(e.message); resolve(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000, keepaliveInterval: 5000 });
  });
})();
