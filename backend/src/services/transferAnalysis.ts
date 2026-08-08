import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getLatestSuccessfulArtifact } from "./artifactEvidence";
import type { DiagnosticResult } from "./agentTypes";
import { componentsForPython } from "./knowledgeComponents";

interface PythonStatement {
  type: string;
  line?: number;
  depth: number;
  parent: string;
  target?: string;
  call?: string;
  expression?: { kind?: string; name?: string; operator?: string };
  condition?: { kind?: string; operator?: string };
  iterator?: { kind?: string; name?: string };
}

export interface PythonStructure {
  valid: boolean;
  error: { message: string; line?: number } | null;
  statements: PythonStatement[];
}

export interface TransferComparison {
  available: boolean;
  syntax_valid: boolean;
  matched_count: number;
  expected_count: number;
  missing: Array<{ kind: string; block_id?: string }>;
  nesting_issues: Array<{ kind: string; line?: number; block_id?: string }>;
  order_issue: boolean;
  diagnostics: DiagnosticResult[];
}

export function analyzePythonStructure(code: string, timeoutMs = 1000): Promise<PythonStructure> {
  const compiledSibling = path.join(__dirname, "python_analyzer.py");
  const analyzerPath = fs.existsSync(compiledSibling)
    ? compiledSibling
    : path.join(process.cwd(), "src", "services", "python_analyzer.py");
  return new Promise((resolve) => {
    const child = spawn("python", [analyzerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let output = "";
    let settled = false;
    const finish = (value: PythonStructure) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ valid: false, error: { message: "analysis_timeout" }, statements: [] });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.on("error", () => finish({ valid: false, error: { message: "analysis_unavailable" }, statements: [] }));
    child.on("close", () => {
      if (settled) return;
      try { finish(JSON.parse(output.trim()) as PythonStructure); }
      catch { finish({ valid: false, error: { message: "analysis_invalid_result" }, statements: [] }); }
    });
    child.stdin.end(JSON.stringify({ code }));
  });
}

function sameShape(expected: PythonStatement, actual: PythonStatement) {
  if (expected.type !== actual.type) return false;
  if (expected.target && expected.target !== actual.target) return false;
  if (expected.call && expected.call !== actual.call) return false;
  if (expected.expression?.kind && expected.expression.kind !== actual.expression?.kind) return false;
  if (expected.expression?.operator && expected.expression.operator !== actual.expression?.operator) return false;
  if (expected.condition?.kind && expected.condition.kind !== actual.condition?.kind) return false;
  if (expected.condition?.operator && expected.condition.operator !== actual.condition?.operator) return false;
  if (expected.iterator?.kind && expected.iterator.kind !== actual.iterator?.kind) return false;
  return true;
}

function componentsForStatement(statement: PythonStatement): string[] {
  const sample = statement.type === "if" ? "if value == 1:\n    value = 1"
    : statement.type === "for" ? "for i in range(2):\n    value = 1"
      : statement.call ? `${statement.call}(\"x\")`
        : statement.target ? `${statement.target} = ${statement.target} + 1` : "";
  return componentsForPython(sample);
}

export async function buildTransferComparison(args: {
  userId: string;
  taskId: number;
  currentCode: string;
  evidenceId?: string;
}): Promise<TransferComparison> {
  const source = await getLatestSuccessfulArtifact(args.userId, args.taskId, "A");
  if (!source?.generated_code || !args.currentCode.trim()) {
    return { available: false, syntax_valid: true, matched_count: 0, expected_count: 0, missing: [], nesting_issues: [], order_issue: false, diagnostics: [] };
  }
  const [expected, actual] = await Promise.all([
    analyzePythonStructure(source.generated_code),
    analyzePythonStructure(args.currentCode),
  ]);
  if (!actual.valid) {
    return {
      available: true,
      syntax_valid: false,
      matched_count: 0,
      expected_count: expected.statements.length,
      missing: [], nesting_issues: [], order_issue: false,
      diagnostics: [{
        code: "blocks_to_python_syntax_transfer",
        knowledge_components: ["blocks_to_python_transfer", "indentation"],
        severity: "blocking",
        evidence_ids: args.evidenceId ? [args.evidenceId] : [],
        line: actual.error?.line,
        resolved: false,
      }],
    };
  }
  const used = new Set<number>();
  const matchedActualLines: number[] = [];
  const lineBlockMap = (source.semantic_features?.line_block_map || {}) as Record<string, string>;
  const missing: TransferComparison["missing"] = [];
  const nestingIssues: TransferComparison["nesting_issues"] = [];
  const diagnostics: DiagnosticResult[] = [];
  for (const expectedStatement of expected.statements) {
    const index = actual.statements.findIndex((item, candidateIndex) => !used.has(candidateIndex) && sameShape(expectedStatement, item));
    const blockId = expectedStatement.line ? lineBlockMap[String(expectedStatement.line)] : undefined;
    if (index < 0) {
      missing.push({ kind: expectedStatement.type, block_id: blockId });
      diagnostics.push({
        code: `transfer_missing_${expectedStatement.type}`,
        knowledge_components: [...new Set(["blocks_to_python_transfer", ...componentsForStatement(expectedStatement)])],
        severity: "warning",
        evidence_ids: args.evidenceId ? [args.evidenceId] : [],
        block_id: blockId,
        resolved: false,
      });
      continue;
    }
    used.add(index);
    const actualStatement = actual.statements[index];
    if (actualStatement.line) matchedActualLines.push(actualStatement.line);
    if (expectedStatement.depth !== actualStatement.depth || expectedStatement.parent !== actualStatement.parent) {
      nestingIssues.push({ kind: expectedStatement.type, line: actualStatement.line, block_id: blockId });
      diagnostics.push({
        code: "transfer_wrong_nesting",
        knowledge_components: ["blocks_to_python_transfer", "structure_nesting", "indentation"],
        severity: "blocking",
        evidence_ids: args.evidenceId ? [args.evidenceId] : [],
        block_id: blockId,
        line: actualStatement.line,
        resolved: false,
      });
    }
  }
  const orderIssue = matchedActualLines.some((line, index) => index > 0 && line < matchedActualLines[index - 1]);
  if (orderIssue) {
    diagnostics.push({
      code: "transfer_wrong_order",
      knowledge_components: ["blocks_to_python_transfer", "sequence_execution"],
      severity: "warning",
      evidence_ids: args.evidenceId ? [args.evidenceId] : [],
      resolved: false,
    });
  }
  return {
    available: true,
    syntax_valid: true,
    matched_count: used.size,
    expected_count: expected.statements.length,
    missing,
    nesting_issues: nestingIssues,
    order_issue: orderIssue,
    diagnostics,
  };
}
