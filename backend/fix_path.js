const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      // Simple fix: move frontend/dist one level up
      console.log("Moving dist to correct path...");
      await new Promise(res => {
        conn.exec("sudo mv /home/ubuntu/icap/frontend/dist /home/ubuntu/frontend 2>/dev/null; sudo mkdir -p /home/ubuntu/frontend; sudo cp -r /home/ubuntu/icap/frontend/dist/* /home/ubuntu/frontend/ 2>/dev/null; sudo mkdir -p /home/ubuntu/frontend/dist 2>/dev/null; sudo cp -r /home/ubuntu/icap/frontend/dist/* /home/ubuntu/frontend/dist/ 2>/dev/null; echo DONE", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Actually, simplest: create the path that index.ts expects
      console.log("Creating correct path structure...");
      await new Promise(res => {
        conn.exec("sudo mkdir -p /home/ubuntu/frontend/dist && sudo cp /home/ubuntu/icap/frontend/dist/* /home/ubuntu/frontend/dist/ && ls /home/ubuntu/frontend/dist/ && echo OK", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });

      // Restart
      console.log("Restarting...");
      await new Promise(res => {
        conn.exec("sudo pkill -f tsx 2>/dev/null; sleep 2; cd /home/ubuntu/icap && nohup sudo npx tsx src/index.ts > /tmp/icap.log 2>&1 & disown; sleep 10; echo RESTARTED", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      }, 30000);

      // Test
      console.log("Testing...");
      await new Promise(res => {
        conn.exec("curl -s http://localhost:3001/api/health && echo && curl -s http://localhost:3001/ | head -3", (e, s) => {
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
