const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Create script in /usr/local/bin (not under noexec /home)
      console.log("Creating script in /usr/local/bin...");
      await new Promise(res => {
        conn.exec(`sudo tee /usr/local/bin/blockpython-start.sh << 'SCRIPT'
#!/bin/bash
cd /home/ubuntu/icap
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/home/ubuntu
export NODE_ENV=production
exec npx tsx src/index.ts
SCRIPT
sudo chmod +x /usr/local/bin/blockpython-start.sh
echo CREATED`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Update systemd to use /usr/local/bin path
      await new Promise(res => {
        conn.exec(`sudo tee /etc/systemd/system/blockpython.service << 'EOF'
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
EOF
echo UPDATED`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Kill any manual process first, then restart via systemd
      await new Promise(res => {
        conn.exec("pkill -f 'tsx.*index' 2>/dev/null; sleep 2; sudo systemctl daemon-reload && sudo systemctl reset-failed blockpython 2>/dev/null; sudo systemctl restart blockpython; sleep 12; echo DONE", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      console.log("Status:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager -l | head -8; echo ===; curl -s http://localhost:3001/api/health", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      console.log("\nLog:");
      await new Promise(res => {
        conn.exec("tail -8 /tmp/icap.log", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end(); r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
