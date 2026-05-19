const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Find correct paths
      console.log("Finding correct paths...");
      await new Promise(res => {
        conn.exec("which npx; which node; echo ---; ls /home/ubuntu/.npm/_npx/fd45a72a545557e9/node_modules/.bin/tsx 2>/dev/null; echo ---; echo $PATH", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Fix: use full path to node + tsx
      const serviceContent = `[Unit]
Description=BlockPython ICAP Platform
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/icap
ExecStart=/usr/bin/node --require /home/ubuntu/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/preflight.cjs --import file:///home/ubuntu/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/loader.mjs src/index.ts
Restart=always
RestartSec=10
StandardOutput=append:/tmp/icap.log
StandardError=append:/tmp/icap.log
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin:/home/ubuntu/.npm/_npx/fd45a72a545557e9/node_modules/.bin

[Install]
WantedBy=multi-user.target
`;

      console.log("Updating service with correct paths...");
      await new Promise(res => {
        conn.exec(`sudo tee /etc/systemd/system/blockpython.service << 'EOF'
${serviceContent}
EOF
echo UPDATED`, (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Reload and start
      await new Promise(res => {
        conn.exec("sudo systemctl daemon-reload && sudo systemctl restart blockpython && sleep 8 && echo RESTARTED", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      // Check
      console.log("Status:");
      await new Promise(res => {
        conn.exec("sudo systemctl status blockpython --no-pager -l | head -8; echo ===; curl -s http://localhost:3001/api/health", (e, s) => {
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
