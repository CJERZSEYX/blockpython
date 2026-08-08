import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { projectVariableMap, type VariableMapConfig } from "./variableMap";

export type RunStatus =
  | "syntax_error"
  | "runtime_error"
  | "target_mismatch"
  | "target_met"
  | "timeout";

export interface TraceEvent {
  seq: number;
  type: "line" | "print" | "input" | "variables" | "stage";
  line?: number;
  text?: string;
  value?: string;
  prompt?: string;
  variables?: Record<string, string | number | boolean | null>;
  action?: string;
  payload?: Record<string, unknown>;
  stage_state?: Record<string, unknown>;
  final?: boolean;
}

export interface PythonRunResult {
  status: RunStatus;
  started: boolean;
  stdout: string;
  stderr: string;
  line: number | null;
  events: TraceEvent[];
  variables?: Record<string, string | number | boolean | null>;
  stage_state?: Record<string, unknown>;
  ast_features?: Record<string, boolean>;
}

interface RawRunnerResult extends Omit<PythonRunResult, "status"> {
  status: "executed" | "syntax_error" | "runtime_error";
}

export interface TargetConfig {
  mode: "exact" | "template" | "input_case" | "stage";
  expected?: string;
  template?: string;
  cases?: Record<string, string>;
  default?: string;
  expected_state?: Record<string, unknown>;
  state_cases?: Record<string, Record<string, unknown>>;
  default_state?: Record<string, unknown>;
  expected_stdout?: string;
  stdout_cases?: Record<string, string>;
  expected_variables?: Record<string, string | number | boolean | null>;
  required_features?: Array<"has_for" | "has_if" | "has_input">;
}

export function resolveExpectedOutput(target: TargetConfig, input: string): string {
  const firstInputLine = input.split(/\r?\n/)[0] || "";
  if (target.mode === "template") {
    return String(target.template || "").replace(/\{input\}/g, firstInputLine);
  }
  if (target.mode === "input_case") {
    return target.cases?.[firstInputLine] ?? target.default ?? "";
  }
  return target.expected || "";
}

function replaceInputTemplates(value: unknown, input: string): unknown {
  if (typeof value === "string") return value.replace(/\{input\}/g, input.split(/\r?\n/)[0] || "");
  if (Array.isArray(value)) return value.map((item) => replaceInputTemplates(item, input));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceInputTemplates(item, input)])
    );
  }
  return value;
}

export function resolveExpectedStage(
  target: TargetConfig,
  input: string
): Record<string, unknown> {
  const firstInputLine = input.split(/\r?\n/)[0] || "";
  const selected = target.state_cases?.[firstInputLine]
    ?? target.default_state
    ?? target.expected_state
    ?? {};
  return replaceInputTemplates(selected, input) as Record<string, unknown>;
}

function containsExpected(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((item, index) => containsExpected(actual[index], item));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected).every(([key, value]) =>
      containsExpected((actual as Record<string, unknown>)[key], value)
    );
  }
  return actual === expected;
}

export function stageTargetMet(
  target: TargetConfig,
  input: string,
  stageState: Record<string, unknown> | undefined,
  variables: Record<string, string | number | boolean | null> | undefined,
  features: Record<string, boolean> | undefined = {},
  stdout = ""
): boolean {
  const firstInputLine = input.split(/\r?\n/)[0] || "";
  if (
    target.state_cases
    && !Object.prototype.hasOwnProperty.call(target.state_cases, firstInputLine)
    && !target.default_state
  ) {
    return false;
  }
  const expectedStdout = target.stdout_cases?.[firstInputLine] ?? target.expected_stdout;
  return containsExpected(stageState || {}, resolveExpectedStage(target, input))
    && containsExpected(variables || {}, target.expected_variables || {})
    && (target.required_features || []).every((feature) => features?.[feature] === true)
    && (expectedStdout === undefined || stdout === expectedStdout);
}

export function runPython(
  code: string,
  input = "",
  timeoutMs = 5000,
  stage: Record<string, unknown> = {}
): Promise<PythonRunResult> {
  const compiledSibling = path.join(__dirname, "python_runner.py");
  const runnerPath = fs.existsSync(compiledSibling)
    ? compiledSibling
    : path.join(process.cwd(), "src", "services", "python_runner.py");

  return new Promise((resolve) => {
    const child = spawn("python", [runnerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: PythonRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({
        status: "timeout",
        started: true,
        stdout: "",
        stderr: "程序运行超过5秒限制",
        line: null,
        events: [],
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > 1024 * 1024) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finish({
        status: "runtime_error",
        started: false,
        stdout: "",
        stderr: error.message,
        line: null,
        events: [],
      });
    });
    child.on("close", () => {
      if (settled) return;
      try {
        const parsed = JSON.parse(stdout.trim()) as RawRunnerResult;
        const normalized = {
          ...parsed,
          status: parsed.status === "executed" ? "target_met" : parsed.status,
        } as PythonRunResult;
        finish(projectVariableMap(normalized, stage as VariableMapConfig));
      } catch {
        finish({
          status: "runtime_error",
          started: false,
          stdout: "",
          stderr: stderr || "运行器未返回有效结果",
          line: null,
          events: [],
        });
      }
    });

    child.stdin.end(JSON.stringify({ code, input, stage }));
  });
}
