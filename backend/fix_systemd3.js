const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // 方案：创建一个 shell 启动脚本，systemd 调用脚本
      console.log("Creating startup script...");
      await new Promise(res => {
        conn.exec(`cat > /home/ubuntu/icap/start.sh << 'SCRIPT'
#!/bin/bash
cd /home/ubuntu/icap
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/home/ubuntu
export NODE_ENV=production
exec npx tsx src/index.ts
SCRIPT
chmod +x /home/ubuntu/icap/start.sh
echo SCRIPT_CREATED`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Update systemd to use the script
      const serviceContent = `[Unit]
Description=BlockPython ICAP Platform
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/icap
ExecStart=/home/ubuntu/icap/start.sh
Restart=always
RestartSec=10
StandardOutput=append:/tmp/icap.log
StandardError=append:/tmp/icap.log

[Install]
WantedBy=multi-user.target
`;

      console.log("Updating systemd...");
      await new Promise(res => {
        conn.exec(`sudo tee /etc/systemd/system/blockpython.service << 'EOF'
${serviceContent}
EOF
echo UPDATED`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Reset failure counter and restart
      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl reset-failed blockpython 2>/dev/null; sudo systemctl restart blockpython; sleep 12; echo DONE", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      // Status
      console.log("Status:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager -l | head -8; echo ===; curl -s http://localhost:3001/api/health || echo DOWN", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      console.log("\nLog:");
      await new Promise(res => {
        conn.exec("tail -15 /tmp/icap.log", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end(); r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
