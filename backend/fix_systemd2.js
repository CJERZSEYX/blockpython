const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Simpler: use npx directly with full PATH
      const serviceContent = `[Unit]
Description=BlockPython ICAP Platform
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/icap
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
Environment=HOME=/home/ubuntu
ExecStart=/usr/bin/npx tsx src/index.ts
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
EOF
echo UPDATED`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl stop blockpython 2>/dev/null; sleep 1; sudo systemctl start blockpython; sleep 10; echo DONE", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      console.log("Status:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager -l | head -10; echo ===; curl -s http://localhost:3001/api/health; echo; echo ===; tail -20 /tmp/icap.log", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end();
      r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
