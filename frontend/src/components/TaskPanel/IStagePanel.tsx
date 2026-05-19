import { useState, useEffect } from "react";
import { Typography, Space, Button, Tag, Progress } from "antd";
import { useAppStore } from "../../store/useAppStore";
import { runCode } from "../../services/submitService";
import { trackAction } from "../../services/trackService";
import { updateStage, completeTask } from "../../services/taskService";

const { Text, Paragraph } = Typography;

export default function IStagePanel() {
  const pythonCode = useAppStore((s) => s.pythonCode);
  const setPythonCode = useAppStore((s) => s.setPythonCode);
  const setPendingSystemMessage = useAppStore((s) => s.setPendingSystemMessage);
  const taskContent = useAppStore((s) => s.taskContent);
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ stdout: string; stderr: string } | null>(null);
  const [iRunCount, setIRunCount] = useState(0);
  const user = useAppStore((s) => s.user);
  const sessionId = useAppStore((s) => s.sessionId);
  const dialogTurnCount = useAppStore((s) => s.dialogTurnCount);
  const completedStages = useAppStore((s) => s.completedStages);
  const selectedTask = useAppStore((s) => s.selectedTask);
  const markStageCompleted = useAppStore((s) => s.markStageCompleted);

  const tid = selectedTask?.id || 0;
  const pDone = completedStages.has(`${tid}-P`);
  const aDone = completedStages.has(`${tid}-A`);
  const cDone = completedStages.has(`${tid}-C`);
  const iDone = completedStages.has(`${tid}-I`);
  const allDone = pDone && aDone && cDone;
  const enoughTurns = dialogTurnCount >= 5;

  useEffect(() => {
    if (started && allDone && enoughTurns && !iDone) {
      markStageCompleted("I");
      if (selectedTask && user?.id) {
        updateStage(user.id, selectedTask.id, "I").catch(() => {});
        completeTask(user.id, selectedTask.id).catch(() => {});
      }
    }
  }, [started, allDone, enoughTurns, iDone]);

  const handleStart = () => {
    setStarted(true);
    trackAction({ user_id: user!.id, session_id: sessionId, stage: "I", action_type: "i_collab_start" });
    setPendingSystemMessage(
      `You are a learning partner. Follow these steps:\n1. Summarize in 2-3 sentences the knowledge points from the C-stage (${taskContent?.c_stage?.title || "Challenge"}) and what was learned across P/A/C stages\n2. Ask the student a thought-provoking question\n3. Then discuss freely with the student\nUse a peer tone. Start with steps 1 and 2.`
    );
  };

  const handleRun = async () => {
    if (!pythonCode.trim()) return;
    setRunning(true);
    const count = iRunCount + 1;
    setIRunCount(count);
    try {
      const res = await runCode(pythonCode);
      setRunResult(res);
      trackAction({ user_id: user!.id, session_id: sessionId, stage: "I", action_type: "i_code_run", action_detail: { attempt: count } });
    } catch { setRunResult({ stdout: "", stderr: "Failed to run" }); } finally { setRunning(false); }
  };

  const turnPercent = Math.min(Math.round((dialogTurnCount / 5) * 100), 100);

  return (
    <>
      <div style={{ background: "#f0f5ff", borderRadius: 8, padding: 16, border: "1px solid #adc6ff" }}>
        <Text strong style={{ color: "#2f54eb", fontSize: 18 }}>Interaction</Text>
        <Paragraph style={{ marginTop: 8, color: "#2f54eb" }}>
          {iDone ? "Congratulations! You have completed all stages of this task." : started ? "Your learning partner is ready. You can freely explore code and chat in the dialogue window." : "Click below — your learning partner will review what you've learned, ask you a question, and you can ask back!"}
        </Paragraph>
        {!started && <Button type="primary" onClick={handleStart} style={{ marginTop: 8 }} disabled={iDone}>Start Collaboration</Button>}
        {started && !iDone && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Requirements: P/A/C stages completed + 5 dialog rounds (auto-completes when met)</Text>
            <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Tag color={pDone ? "success" : "default"}>P Stage{pDone ? " ✓" : ""}</Tag>
              <Tag color={aDone ? "success" : "default"}>A Stage{aDone ? " ✓" : ""}</Tag>
              <Tag color={cDone ? "success" : "default"}>C Stage{cDone ? " ✓" : ""}</Tag>
              <Tag color={enoughTurns ? "success" : "processing"}>Turns {dialogTurnCount}/5</Tag>
            </div>
            <Progress percent={turnPercent} size="small" style={{ marginTop: 6, maxWidth: 300 }} />
          </div>
        )}
        {iDone && <Tag color="success" style={{ marginTop: 8 }}>All Complete ✓</Tag>}
      </div>
      <div style={{ background: "#fff", borderRadius: 8, padding: 16, border: "1px solid #e8e8e8" }}>
        <Text strong>Interaction Guide</Text>
        <div style={{ marginTop: 8 }}><Tag color="blue">Step 1</Tag> Click "Start Collaboration"</div>
        <div style={{ marginTop: 4 }}><Tag color="blue">Step 2</Tag> Answer and ask questions (at least 5 rounds)</div>
        <div style={{ marginTop: 4 }}><Tag color="blue">Step 3</Tag> Explore code freely below</div>
      </div>
      <div style={{ border: "1px solid #d9d9d9", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ background: "#282c34", color: "#abb2bf", padding: "6px 12px", fontSize: 12 }}>Python Code Explorer</div>
        <textarea value={pythonCode} onChange={(e) => setPythonCode(e.target.value)}
          style={{ width: "100%", minHeight: 180, background: "#1e1e1e", color: "#d4d4d4", border: "none", padding: 12, fontFamily: "Consolas, monospace", fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
          placeholder="# Explore Python code freely..." />
      </div>
      <Space style={{ marginTop: 8 }}><Button type="primary" onClick={handleRun} loading={running}>Run Code</Button></Space>
      {runResult && (
        <div style={{ border: "1px solid #d9d9d9", borderRadius: 6, padding: 12, background: "#1e1e1e" }}>
          <Text style={{ color: "#52c41a", fontSize: 12 }}>Result</Text>
          {runResult.stdout && <pre style={{ color: "#d4d4d4", margin: "4px 0 0", whiteSpace: "pre-wrap", fontSize: 13 }}>{runResult.stdout}</pre>}
          {runResult.stderr && <pre style={{ color: "#ff4d4f", margin: "4px 0 0", whiteSpace: "pre-wrap", fontSize: 13 }}>{runResult.stderr}</pre>}
          {!runResult.stdout && !runResult.stderr && <pre style={{ color: "#888", margin: "4px 0 0", fontSize: 13 }}>(no output)</pre>}
        </div>
      )}
    </>
  );
}
