const { Client } = require("ssh2");
const HOST = "82.156.85.157", USER = "ubuntu", PASS = "wsadqe12!";

function execCmd(conn, cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      let out = "";
      stream.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on("data", (d) => { out += d; process.stdout.write(d); });
      stream.on("close", () => { clearTimeout(timer); resolve(out); });
    });
  });
}

(async () => {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on("ready", async () => {
      try {
        console.log("Health check:");
        await execCmd(conn, "curl -s http://localhost:3001/api/health");
        console.log("\n\nTask list:");
        await execCmd(conn, "curl -s http://localhost:3001/api/task/list");
        console.log("\n\nDone! http://82.156.85.157:3001");
        conn.end(); resolve();
      } catch(e) { console.error(e.message); conn.end(); resolve(); }
    });
    conn.on("error", e => { console.error(e.message); resolve(); });
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 15000 });
  });
})();
