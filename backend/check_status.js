const { Client } = require("ssh2");
(async () => {
  const conn = new Client();
  await new Promise(r => {
    conn.on("ready", async () => {
      await new Promise(res => {
        conn.exec("ps aux | grep -E 'tsx|node' | grep -v grep; echo ===; curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health 2>/dev/null || echo DOWN", (e, s) => {
          let o = ""; s.on("data", d => { o += d; process.stdout.write(d); }); s.on("close", () => { console.log(); res(); });
        });
      });
      conn.end(); r();
    });
    conn.on("error", e => { console.error(e); r(); });
    conn.connect({ host: "82.156.85.157", port: 22, username: "ubuntu", password: "wsadqe12!", readyTimeout: 15000 });
  });
})();
