const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Show config and force start
      console.log("Config:");
      await new Promise(res => {
        conn.exec("cat /etc/systemd/system/blockpython.service", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Force start with debug
      console.log("\nForce starting...");
      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl reset-failed blockpython 2>/dev/null; sudo systemctl start blockpython 2>&1; echo EXIT=$?; sleep 12", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      console.log("\nStatus after start:");
      await new Promise(res => {
        conn.exec("sudo systemctl is-active blockpython; echo ---; sudo systemctl status blockpython --no-pager -l | head -8; echo ===; curl -s http://localhost:3001/api/health || echo DOWN", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      console.log("\nJournal (last 5):");
      await new Promise(res => {
        conn.exec("sudo journalctl -u blockpython --no-pager -n 5 --since '1 min ago'", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end(); r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
