const mysql = require("mysql2/promise");
(async () => {
  const p = await mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });
  const [r] = await p.query("SELECT id, content_json FROM tasks ORDER BY id");
  r.forEach(row => {
    const json = JSON.stringify(row.content_json);
    const m = json.match(/[\u4e00-\u9fff]{2,}/g);
    if (m) console.log(`Task ${row.id}:`, [...new Set(m)].slice(0, 10).join(", "));
    else console.log(`Task ${row.id}: CLEAN`);
  });
  await p.end();
})();
