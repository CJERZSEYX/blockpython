import { useState } from "react";
import { Typography, Space, Button, Alert, Spin } from "antd";
import type { TaskContent } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { runCode } from "../../services/submitService";
import { trackAction } from "../../services/trackService";

const { Text, Paragraph } = Typography;

interface CStagePanelProps {
  taskContent: TaskContent | null;
}

export default function CStagePanel({ taskContent }: CStagePanelProps) {
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ passed: boolean; stdout: string; stderr: string } | null>(null);
  const [runAttempts, setRunAttempts] = useState(0);
  const pythonCode = useAppStore((s) => s.pythonCode);
  const setPythonCode = useAppStore((s) => s.setPythonCode);
  const setPendingSystemMessage = useAppStore((s) => s.setPendingSystemMessage);
  const user = useAppStore((s) => s.user);
  const sessionId = useAppStore((s) => s.sessionId);
  const markStageCompleted = useAppStore((s) => s.markStageCompleted);
  const cStageBlocksXml = useAppStore((s) => s.cStageBlocksXml);

  const handleRun = async () => {
    if (!pythonCode.trim()) return;
    setRunning(true);
    const att = runAttempts + 1;
    setRunAttempts(att);
    try {
      const expectedOutput = taskContent?.c_stage?.expected_output || "";
      const res = await runCode(pythonCode, expectedOutput);
      setRunResult(res);
      trackAction({ user_id: user!.id, session_id: sessionId, stage: "C", action_type: "c_run", action_detail: { passed: res.passed, attempt: att, has_stderr: !!res.stderr } });
      if (res.passed) markStageCompleted("C");
      if (!res.passed) {
        const answerCode = taskContent?.c_stage?.answer_code || "";
        const blockXml = cStageBlocksXml || "";
        let hint = `The student is working on the C-stage task and their code did not pass.\n`;
        if (blockXml) hint += `[Block Diagram XML]\n${blockXml.substring(0, 500)}\n`;
        if (answerCode) hint += `[Reference Answer]\n${answerCode}\n`;
        hint += `[Student Code]\n${pythonCode}\n`;
        hint += `[Output] stdout:${res.stdout || "(empty)"} stderr:${res.stderr || "(empty)"}\n`;
        hint += `Based on the block diagram and reference answer, help the student identify the issue without giving code. Keep it within 2 sentences.`;
        setPendingSystemMessage(hint);
      }
    } catch (_) { /* ignore */ } finally { setRunning(false); }
  };

  const handleAskForHint = () => {
    trackAction({ user_id: user!.id, session_id: sessionId, stage: "C", action_type: "c_hint_request", action_detail: { attempts_so_far: runAttempts } });
    setPendingSystemMessage(
      `The student is working on the C-stage task: "${taskContent?.c_stage?.title || ""}" — ${taskContent?.c_stage?.description || ""}. Expected output is "${taskContent?.c_stage?.expected_output || ""}". Give a directional hint (no code) to guide them. Keep it within 2 sentences.`
    );
  };

  return (
    <>
      <div style={{ background: "#f6ffed", borderRadius: 8, padding: 16, border: "1px solid #b7eb8f" }}>
        <Text strong style={{ color: "#52c41a", fontSize: 18 }}>{taskContent?.c_stage?.title || "Challenge"}</Text>
        <Paragraph style={{ marginTop: 8, fontSize: 15 }}>{taskContent?.c_stage?.description || ""}</Paragraph>
        <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>Expected output: {taskContent?.c_stage?.expected_output || ""}</Paragraph>
      </div>
      <div style={{ background: "#e6f7ff", borderRadius: 8, padding: 12, border: "1px solid #91d5ff" }}>
        <Text type="secondary">Observe the block diagram on the left and write the corresponding Python code. If you get stuck, ask the LLM on the right for help — it will guide you without giving code.</Text>
        <br />
        <Button type="link" onClick={handleAskForHint} style={{ padding: 0, marginTop: 6 }}>Ask LLM for hint</Button>
        {!useAppStore.getState().cStageBlocksXml && <div style={{ marginTop: 8 }}><Spin size="small" /> <Text type="secondary">Generating block diagram...</Text></div>}
      </div>
      <div style={{ border: "1px solid #d9d9d9", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ background: "#282c34", color: "#abb2bf", padding: "6px 12px", fontSize: 12 }}>Python Code</div>
        <textarea value={pythonCode} onChange={(e) => setPythonCode(e.target.value)}
          style={{ width: "100%", minHeight: 200, background: "#1e1e1e", color: "#d4d4d4", border: "none", padding: 12, fontFamily: "Consolas, monospace", fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
          placeholder="# Observe the blocks on the left and write Python code here..." />
      </div>
      <Space style={{ marginTop: 12 }}><Button type="primary" onClick={handleRun} loading={running}>Run Code</Button></Space>
      {runResult && (<>
        <Alert style={{ marginTop: 12 }} type={runResult.passed ? "success" : "error"}
          message={runResult.passed ? "Passed! Output matches expected." : "Incorrect result"}
          showIcon />
        <div style={{ marginTop: 8, border: "1px solid #d9d9d9", borderRadius: 6, padding: 12, background: "#1e1e1e" }}>
          <Text style={{ color: "#52c41a", fontSize: 12 }}>Output</Text>
          {runResult.stdout && <pre style={{ color: "#d4d4d4", margin: "4px 0 0", whiteSpace: "pre-wrap", fontSize: 13 }}>{runResult.stdout}</pre>}
          {runResult.stderr && <pre style={{ color: "#ff4d4f", margin: "4px 0 0", whiteSpace: "pre-wrap", fontSize: 13 }}>{runResult.stderr}</pre>}
          {!runResult.stdout && !runResult.stderr && <pre style={{ color: "#888", margin: "4px 0 0", fontSize: 13 }}>(no output)</pre>}
        </div>
      </>)}
    </>
  );
}
