const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Create systemd service file
      const serviceContent = `[Unit]
Description=BlockPython ICAP Platform
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/icap
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
RestartSec=10
StandardOutput=append:/tmp/icap.log
StandardError=append:/tmp/icap.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

      console.log("Creating systemd service...");
      await new Promise(res => {
        conn.exec(`sudo tee /etc/systemd/system/blockpython.service << 'EOF'
${serviceContent}
EOF
echo SERVICE_CREATED`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Stop old nohup process
      console.log("Stopping old nohup process...");
      await new Promise(res => {
        conn.exec("pkill -f 'tsx.*index' 2>/dev/null; sleep 2; echo STOPPED", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Enable and start systemd service
      console.log("Enabling and starting systemd service...");
      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl enable blockpython && sudo systemctl start blockpython && sleep 5 && echo STARTED", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      // Verify
      console.log("Verification:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager -l | head -10; echo ===; curl -s http://localhost:3001/api/health", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      conn.end();
      console.log("\nSystemd service configured. The server will now:");
      console.log("  - Auto-start on system boot");
      console.log("  - Auto-restart if it crashes (Restart=always)");
      console.log("  - Survive SSH session termination");
      r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
