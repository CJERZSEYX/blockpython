const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Kill
      console.log("Killing old...");
      await new Promise(res => {
        conn.exec("sudo pkill -f tsx 2>/dev/null; sleep 2; echo DONE", (e, s) => {
          s.on("data", d => process.stdout.write(d));
          s.on("close", () => res());
        });
      });

      // Start
      console.log("Starting...");
      await new Promise(res => {
        conn.exec("cd /home/ubuntu/icap && nohup sudo npx tsx src/index.ts > /tmp/icap.log 2>&1 & disown; sleep 12; echo READY", (e, s) => {
          s.on("data", d => process.stdout.write(d));
          s.on("close", () => res());
        });
      }, 30000);

      // Health
      console.log("Health:");
      await new Promise(res => {
        conn.exec("curl -s http://localhost:3001/api/health", (e, s) => {
          s.on("data", d => process.stdout.write(d));
          s.on("close", () => res());
        });
      });
      console.log();

      // HTML
      console.log("HTML head:");
      await new Promise(res => {
        conn.exec("curl -s http://localhost:3001/ | head -3", (e, s) => {
          s.on("data", d => process.stdout.write(d));
          s.on("close", () => res());
        });
      });

      conn.end();
      r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
