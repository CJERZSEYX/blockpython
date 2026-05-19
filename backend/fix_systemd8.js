const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      await new Promise(res => {
        conn.exec(`sudo bash -c 'cat > /etc/systemd/system/blockpython.service << "ENDOFFILE"
[Unit]
Description=BlockPython ICAP Platform
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/icap
ExecStart=/bin/bash -c "cd /home/ubuntu/icap && export HOME=/home/ubuntu && exec npx tsx src/index.ts"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
ENDOFFILE'
echo WRITTEN`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl reset-failed blockpython 2>/dev/null; pkill -f 'tsx.*index' 2>/dev/null; sleep 1; sudo systemctl start blockpython; sleep 12; echo RESTARTED", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      console.log("\nStatus:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager | head -6; echo ===; curl -s http://localhost:3001/api/health || echo DOWN", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      console.log("\nJournal:");
      await new Promise(res => {
        conn.exec("sudo journalctl -u blockpython --no-pager -n 5", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end(); r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
