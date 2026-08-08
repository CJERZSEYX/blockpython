import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import pool from "../config/database";
import { generatePythonFromBlockly } from "./blocklyPython";
import { componentsForBlockTypes, componentsForPython } from "./knowledgeComponents";
import type { ArtifactSnapshot, ArtifactType, DiagnosticResult, LearningStage } from "./agentTypes";

interface SaveSnapshotInput {
  userId: string;
  sessionId: string;
  taskId: number;
  stage: LearningStage;
  artifactType: ArtifactType;
  content: string;
  sourceAction: string;
  generatedCode?: string;
  diagnostics?: DiagnosticResult[];
  semanticFeatures?: Record<string, unknown>;
  forceOccurrence?: boolean;
}

export function hashArtifactContent(value: string): string {
  return createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");
}

function pythonFeatures(code: string): Record<string, unknown> {
  const lines = code.split(/\r?\n/);
  return {
    non_empty_lines: lines.filter((line) => line.trim()).length,
    has_assignment: /^[ \t]*[A-Za-z_]\w*[ \t]*=/m.test(code),
    has_input: /\binput\s*\(/.test(code),
    has_print: /\bprint\s*\(/.test(code),
    has_if: /^[ \t]*if\b/m.test(code),
    has_else: /^[ \t]*else\s*:/m.test(code),
    has_for_range: /^[ \t]*for\b[^\n]*\brange\s*\(/m.test(code),
    has_indentation: /\n[ \t]+\S/.test(code),
    knowledge_components: componentsForPython(code),
  };
}

export async function saveArtifactSnapshot(input: SaveSnapshotInput): Promise<{
  snapshot: ArtifactSnapshot;
  created: boolean;
}> {
  const normalized = input.content.replace(/\r\n/g, "\n");
  const contentHash = hashArtifactContent(normalized);
  const [existingRows] = await pool.query<any[]>(
    `SELECT * FROM artifact_snapshots
     WHERE user_id = ? AND task_id = ? AND stage = ? AND artifact_type = ? AND content_hash = ?
     ORDER BY artifact_version DESC, id DESC LIMIT 1`,
    [input.userId, input.taskId, input.stage, input.artifactType, contentHash]
  );
  if (existingRows.length > 0 && !input.forceOccurrence) {
    return { snapshot: rowToSnapshot(existingRows[0]), created: false };
  }

  let generatedCode = input.generatedCode || "";
  let semanticFeatures = input.semanticFeatures || {};
  if (input.artifactType === "blockly") {
    const generated = generatePythonFromBlockly(normalized);
    generatedCode = generatedCode || generated.code;
    semanticFeatures = {
      block_count: generated.block_count,
      block_types: generated.block_types,
      line_block_map: generated.line_block_map,
      valid: generated.valid,
      knowledge_components: componentsForBlockTypes(generated.block_types),
      ...semanticFeatures,
    };
  } else {
    semanticFeatures = { ...pythonFeatures(normalized), ...semanticFeatures };
  }

  const [versionRows] = await pool.query<any[]>(
    `SELECT COALESCE(MAX(artifact_version), 0) + 1 AS next_version
     FROM artifact_snapshots
     WHERE user_id = ? AND task_id = ? AND stage = ? AND artifact_type = ?`,
    [input.userId, input.taskId, input.stage, input.artifactType]
  );
  const artifactVersion = Number(versionRows[0]?.next_version || 1);
  const snapshotId = uuidv4();
  const diagnostics = input.diagnostics || [];

  await pool.query(
    `INSERT INTO artifact_snapshots
      (snapshot_id, user_id, session_id, task_id, stage, artifact_type,
       artifact_version, content_hash, content, generated_code, semantic_features,
       diagnostics, source_action)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshotId,
      input.userId,
      input.sessionId,
      input.taskId,
      input.stage,
      input.artifactType,
      artifactVersion,
      contentHash,
      normalized,
      generatedCode || null,
      JSON.stringify(semanticFeatures),
      JSON.stringify(diagnostics),
      input.sourceAction,
    ]
  );

  return {
    created: true,
    snapshot: {
      snapshot_id: snapshotId,
      task_id: input.taskId,
      stage: input.stage,
      artifact_type: input.artifactType,
      artifact_version: artifactVersion,
      content_hash: contentHash,
      content: normalized,
      generated_code: generatedCode || undefined,
      semantic_features: semanticFeatures,
      diagnostics,
      source_action: input.sourceAction,
    },
  };
}

function parseJson(value: unknown, fallback: any) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function rowToSnapshot(row: any): ArtifactSnapshot {
  return {
    snapshot_id: row.snapshot_id,
    task_id: Number(row.task_id),
    stage: row.stage,
    artifact_type: row.artifact_type,
    artifact_version: Number(row.artifact_version),
    content_hash: row.content_hash,
    content: row.content || "",
    generated_code: row.generated_code || undefined,
    semantic_features: parseJson(row.semantic_features, {}),
    diagnostics: parseJson(row.diagnostics, []),
    source_action: row.source_action,
  };
}

export async function getLatestArtifact(
  userId: string,
  taskId: number,
  stage: LearningStage
): Promise<ArtifactSnapshot | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM artifact_snapshots
     WHERE user_id = ? AND task_id = ? AND stage = ?
     ORDER BY artifact_version DESC, id DESC LIMIT 1`,
    [userId, taskId, stage]
  );
  return rows.length ? rowToSnapshot(rows[0]) : null;
}

export async function getLatestSuccessfulArtifact(
  userId: string,
  taskId: number,
  stage: LearningStage
): Promise<ArtifactSnapshot | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM artifact_snapshots
     WHERE user_id = ? AND task_id = ? AND stage = ?
     ORDER BY artifact_version DESC, id DESC LIMIT 20`,
    [userId, taskId, stage]
  );
  for (const row of rows) {
    const snapshot = rowToSnapshot(row);
    if (
      snapshot.generated_code
      && snapshot.diagnostics.length > 0
      && snapshot.diagnostics.every((item) => item.resolved)
    ) {
      return snapshot;
    }
  }
  return null;
}
