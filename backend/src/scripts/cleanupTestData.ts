import "dotenv/config";
import pool from "../config/database";
import { deleteStudentsByIds, findDisposableStudentIds } from "../services/testDataCleanup";

async function main() {
  const ids = await findDisposableStudentIds();
  const deleted = await deleteStudentsByIds(ids);
  console.log(`Removed ${deleted} disposable student account(s).`);
  await pool.end();
}

main().catch((error) => {
  console.error("Test-data cleanup failed:", error);
  void pool.end();
  process.exitCode = 1;
});
