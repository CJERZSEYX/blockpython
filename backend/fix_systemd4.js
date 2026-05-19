const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Check if noexec
      console.log("Checking mount options...");
      await new Promise(res => {
        conn.exec("mount | grep /home; echo ===; /bin/bash /home/ubuntu/icap/start.sh &  sleep 5; curl -s http://localhost:3001/api/health; kill %1 2>/dev/null", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      // Fix: use bash explicitly
      const serviceContent = `[Unit]
Description=BlockPython ICAP Platform
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/icap
ExecStart=/bin/bash /home/ubuntu/icap/start.sh
Restart=always
RestartSec=10
StandardOutput=append:/tmp/icap.log
StandardError=append:/tmp/icap.log

[Install]
WantedBy=multi-user.target
`;

      console.log("Updating service...");
      await new Promise(res => {
        conn.exec(`sudo tee /etc/systemd/system/blockpython.service << 'EOF'
${serviceContent}
EOF`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl reset-failed blockpython 2>/dev/null; sudo systemctl restart blockpython; sleep 12; echo DONE", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      console.log("Status:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager -l | head -6; echo ===; curl -s http://localhost:3001/api/health || echo DOWN; echo ===; tail -10 /tmp/icap.log", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end(); r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
