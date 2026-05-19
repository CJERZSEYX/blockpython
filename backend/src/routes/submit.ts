import { Router, Request, Response } from "express";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import pool from "../config/database";

export const submitRouter = Router();

function extractBlockTypeCounts(xml: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const regex = /type="([^"]+)"/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const t = match[1];
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

function extractFieldValues(xml: string): Record<string, Record<string, string>[]> {
  const allFields: { type: string; field: string; value: string }[] = [];
  const fieldRx = /<field\s+name="([^"]+)"[^>]*>([^<]*)<\/field>/g;
  let fm;
  while ((fm = fieldRx.exec(xml)) !== null) {
    const beforeField = xml.slice(0, fm.index);
    const blockMatches = beforeField.match(/<block\s[^>]*type="([^"]+)"/g);
    const lastBlock = blockMatches?.[blockMatches.length - 1];
    const blockType = lastBlock?.match(/type="([^"]+)"/)?.[1] || "unknown";
    allFields.push({ type: blockType, field: fm[1], value: fm[2] });
  }

  const result: Record<string, Record<string, string>[]> = {};
  for (const f of allFields) {
    if (!result[f.type]) result[f.type] = [];
    const last = result[f.type][result[f.type].length - 1];
    if (!last || last[f.field] !== undefined) {
      result[f.type].push({});
    }
    result[f.type][result[f.type].length - 1][f.field] = f.value;
  }
  for (const t of Object.keys(result)) {
    result[t] = result[t].filter((o) => Object.keys(o).length > 0);
  }
  return result;
}

function isBlocksConnected(xml: string): boolean {
  const nextCount = (xml.match(/<next\b/g) || []).length;
  const withoutNested = xml
    .replace(/<value\b[^>]*>[\s\S]*?<\/value>/g, "")
    .replace(/<statement\b[^>]*>[\s\S]*?<\/statement>/g, "");
  const topLevelCount = (withoutNested.match(/<block\b/g) || []).length;
  return topLevelCount <= nextCount + 1;
}

interface InferBlocks {
  [type: string]: { count: number; fields?: Record<string, string[]> };
}

function compareBlocks(
  studentXml: string,
  inferred: InferBlocks
): {
  passed: boolean;
  expected: Record<string, number>;
  got: Record<string, number>;
  missing: string[];
  valueErrors: string[];
  connected: boolean;
} {
  const got = extractBlockTypeCounts(studentXml);
  const connected = isBlocksConnected(studentXml);

  const expected: Record<string, number> = {};
  for (const [type, spec] of Object.entries(inferred)) {
    expected[type] = spec.count;
  }

  const missing: string[] = [];
  for (const [type, need] of Object.entries(expected)) {
    const have = got[type] || 0;
    if (have < need) {
      const diff = need - have;
      missing.push(diff > 1 ? `${type}(need ${need}, missing ${diff})` : `${type}(need ${need})`);
    }
  }

  const valueErrors: string[] = [];
  const studentFields = extractFieldValues(studentXml);

  for (const [type, spec] of Object.entries(inferred)) {
    if (!spec.fields) continue;
    const expectedFields = spec.fields;
    const studentTypeFields = studentFields[type] || [];

    for (const [fieldName, expectedValues] of Object.entries(expectedFields)) {
      const studentVals = studentTypeFields.map((f) => f[fieldName]).filter(Boolean);
      const missingVals: string[] = [];
      for (const ev of expectedValues) {
        const idx = studentVals.indexOf(String(ev));
        if (idx >= 0) {
          studentVals.splice(idx, 1);
        } else {
          missingVals.push(String(ev));
        }
      }
      if (missingVals.length > 0) {
        valueErrors.push(`${type} ${fieldName}: expected [${missingVals.join(", ")}]`);
      }
    }
  }

  const passed = missing.length === 0 && valueErrors.length === 0 && connected;
  return { passed, expected, got, missing, valueErrors, connected };
}

function blocksToCountStr(inferred: InferBlocks): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [type, spec] of Object.entries(inferred)) {
    result[type] = spec.count;
  }
  return result;
}

submitRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const { code, expected_output, blockly_xml, check_type, task_id } = req.body;

    if (check_type === "code_to_block") {
      if (!blockly_xml) { res.status(400).json({ error: "Block data cannot be empty" }); return; }

      let inferred: InferBlocks | null = null;
      if (task_id) {
        const [rows] = await pool.query<any[]>(
          "SELECT content_json FROM tasks WHERE id = ?", [task_id]
        );
        if (rows.length > 0) {
          inferred = rows[0].content_json?.inferred_blocks || null;
        }
      }

      if (!inferred) { res.status(400).json({ error: "Task block inference not yet complete" }); return; }

      const result = compareBlocks(blockly_xml, inferred);
      res.json({
        passed: result.passed,
        block_check: {
          expected: blocksToCountStr(inferred),
          got: result.got,
          missing: result.missing,
          valueErrors: result.valueErrors,
          connected: result.connected,
        },
      });
      return;
    }

    if (check_type === "code_run" || check_type === "block_to_code") {
      if (!code) { res.status(400).json({ error: "Code cannot be empty" }); return; }

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pybox-"));
      const tmpFile = path.join(tmpDir, "solution.py");
      fs.writeFileSync(tmpFile, code, "utf-8");

      let result: { stdout: string; stderr: string; passed: boolean };
      try {
        const stdout = execSync(`python "${tmpFile}"`, {
          timeout: 5000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });
        result = { stdout: stdout.trimEnd(), stderr: "", passed: true };
        if (expected_output && stdout.trimEnd() !== expected_output) {
          result.passed = false;
        }
      } catch (execErr: any) {
        result = {
          stdout: execErr.stdout?.trimEnd() || "",
          stderr: execErr.stderr?.trimEnd() || execErr.message || "",
          passed: false,
        };
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });
      res.json(result);
      return;
    }

    res.status(400).json({ error: "Unknown check type" });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: "Request processing failed" });
  }
});
