const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

async function seed() {
  const pool = mysql.createPool({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "123456",
    database: "icap_platform",
  });

  const tasksDir = path.join(__dirname, "tasks");
  const files = ["task1.json", "task2.json", "task3.json"];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(tasksDir, file), "utf-8");
    const task = JSON.parse(raw);
    await pool.query(
      "INSERT INTO tasks (title, description, sort_order, content_json) VALUES (?, ?, ?, ?)",
      [
        task.title,
        task.description,
        task.sort_order,
        JSON.stringify(task.content_json),
      ]
    );
    console.log(`Inserted: ${task.title}`);
  }

  await pool.end();
  console.log("Done.");
}

seed().catch(console.error);
