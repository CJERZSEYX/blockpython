import { useState } from "react";
import { Typography, Space, Button, Alert } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import type { TaskContent } from "../../types";
import type { BlocklyEditorHandle } from "../BlocklyEditor/BlocklyEditor";
import { useAppStore } from "../../store/useAppStore";
import { submitBlocks } from "../../services/submitService";
import { trackAction } from "../../services/trackService";
import { blockIdToName } from "../BlocklyEditor/blockNames";

const { Text } = Typography;

interface AStagePanelProps {
  taskContent: TaskContent | null;
  blocklyRef: React.RefObject<BlocklyEditorHandle | null>;
  taskId: number;
}

export default function AStagePanel({ taskContent, blocklyRef, taskId }: AStagePanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; missing: string[]; valueErrors: string[]; connected: boolean } | null>(null);
  const [attempts, setAttempts] = useState(0);
  const setPendingSystemMessage = useAppStore((s) => s.setPendingSystemMessage);
  const user = useAppStore((s) => s.user);
  const sessionId = useAppStore((s) => s.sessionId);
  const markStageCompleted = useAppStore((s) => s.markStageCompleted);

  const pythonCode = taskContent?.a_stage?.python_code || "score = 85\nif score >= 60:\n    print('Pass')\nelse:\n    print('Fail')";

  const handleSubmit = async () => {
    const xml = blocklyRef.current?.getXml();
    if (!xml || xml === '<xml xmlns="https://developers.google.com/blockly/xml"/>') return;

    setSubmitting(true);
    try {
      const res = await submitBlocks(xml, "", taskId);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setResult({
        passed: res.passed,
        missing: res.block_check.missing,
        valueErrors: res.block_check.valueErrors || [],
        connected: res.block_check.connected,
      });

      trackAction({
        user_id: user!.id, session_id: sessionId, task_id: taskId, stage: "A",
        action_type: "a_submit",
        action_detail: { passed: res.passed, attempt: newAttempts, missing: res.block_check.missing, valueErrors: res.block_check.valueErrors, connected: res.block_check.connected },
      });

      if (res.passed) {
        markStageCompleted("A");
      }

      if (!res.passed) {
        const parts: string[] = [];
        if (res.block_check.missing.length > 0) {
          parts.push(`Missing blocks: ${res.block_check.missing.map((m) => {
            const nameOnly = m.replace(/\(.*\)$/, "");
            return blockIdToName(nameOnly) + (m.includes("(") ? m.match(/\(.*\)/)![0] : "");
          }).join(", ")}`);
        }
        if (res.block_check.valueErrors?.length > 0) parts.push(`Incorrect values: ${res.block_check.valueErrors.join("; ")}`);
        if (!res.block_check.connected) parts.push("Blocks are not connected. Please connect them end to end.");
        if (parts.length > 0) setPendingSystemMessage(`Student block submission has issues: ${parts.join(". ")}. Guide the student using block names to fix it, but don't give code.`);
      }
    } catch (e) { /* ignore */ } finally { setSubmitting(false); }
  };

  return (
    <div style={{ background: "#fffbe6", borderRadius: 8, padding: 16, border: "1px solid #ffe58f" }}>
      <Text strong>Build blocks from the code below</Text>
      <div style={{ marginTop: 8, background: "#1e1e1e", borderRadius: 6, padding: "12px 16px" }}>
        <Text style={{ color: "#d4d4d4", fontFamily: "Consolas, monospace", fontSize: 14, whiteSpace: "pre-wrap" }}>{pythonCode}</Text>
      </div>
      <Space style={{ marginTop: 12 }}>
        <Button type="primary" onClick={handleSubmit} loading={submitting} icon={result?.passed ? <CheckCircleOutlined /> : undefined}>
          {result?.passed ? "Passed!" : "Submit Blocks"}
        </Button>
      </Space>
      {result && (
        <Alert style={{ marginTop: 12 }} type={result.passed ? "success" : "warning"}
          message={result.passed ? "Blocks are correct!" : "Needs adjustment"}
          description={result.passed ? "You can proceed to the next stage." : [
            result.missing.length > 0 ? `Missing blocks: ${result.missing.join(", ")}` : null,
            result.valueErrors.length > 0 ? `Incorrect values: ${result.valueErrors.join("; ")}` : null,
            !result.connected ? "Blocks are not connected. Please connect them end to end." : null,
          ].filter(Boolean).join(" | ")}
          showIcon icon={result.passed ? <CheckCircleOutlined /> : <CloseCircleOutlined />} />
      )}
    </div>
  );
}
