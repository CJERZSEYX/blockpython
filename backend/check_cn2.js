const mysql = require("mysql2/promise");
(async () => {
  const p = await mysql.createPool({ host: "localhost", port: 3306, user: "root", password: "123456", database: "icap_platform_english" });
  const [r] = await p.query("SELECT id, content_json FROM tasks ORDER BY id");
  for (const row of r) {
    const json = JSON.stringify(row.content_json, null, 2);
    const lines = json.split("\n");
    const cnLines = lines
      .filter(l => /[\u4e00-\u9fff]/.test(l))
      .map(l => l.trim().substring(0, 100));
    if (cnLines.length > 0) {
      console.log(`\n=== Task ${row.id}: ${cnLines.length} Chinese lines ===`);
      cnLines.slice(0, 10).forEach(l => console.log("  " + l));
    } else {
      console.log(`\nTask ${row.id}: CLEAN`);
    }
  }
  await p.end();
})();
