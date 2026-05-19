const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // First verify the service file content
      console.log("Current service file:");
      await new Promise(res => {
        conn.exec("cat /etc/systemd/system/blockpython.service", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Force rewrite the service file
      console.log("\nRewriting service file...");
      await new Promise(res => {
        conn.exec(`sudo bash -c 'cat > /etc/systemd/system/blockpython.service << "ENDOFFILE"
[Unit]
Description=BlockPython ICAP Platform
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/icap
ExecStart=/usr/local/bin/blockpython-start.sh
Restart=always
RestartSec=10
StandardOutput=append:/tmp/icap.log
StandardError=append:/tmp/icap.log

[Install]
WantedBy=multi-user.target
ENDOFFILE'
cat /etc/systemd/system/blockpython.service | grep ExecStart`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Full restart
      console.log("\nRestarting...");
      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl reset-failed blockpython 2>/dev/null; sudo systemctl stop blockpython 2>/dev/null; pkill -f 'tsx.*index' 2>/dev/null; sleep 2; sudo systemctl start blockpython; sleep 10; echo RESTARTED", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      // Check
      console.log("\nStatus:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager | head -6; echo ===; curl -s http://localhost:3001/api/health || echo DOWN; echo ===; tail -5 /tmp/icap.log", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end(); r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
