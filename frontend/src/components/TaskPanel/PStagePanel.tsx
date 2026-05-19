import { useState } from "react";
import { Typography, Empty, Button, Tag, Card } from "antd";
import { DownOutlined, RightOutlined, LockOutlined, ArrowRightOutlined, CheckCircleFilled } from "@ant-design/icons";
import type { Subtask, BlockMapping } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { trackAction } from "../../services/trackService";
import { colorMap, colorLabelMap } from "./constants";

const { Text, Paragraph } = Typography;

function BlockCard({ block }: { block: BlockMapping }) {
  const [expanded, setExpanded] = useState(false);
  const user = useAppStore((s) => s.user);
  const sessionId = useAppStore((s) => s.sessionId);
  const currentStage = useAppStore((s) => s.currentStage);
  const selectedTask = useAppStore((s) => s.selectedTask);
  const color = colorMap[block.color] || "#4361ee";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
    if (!expanded && user) {
      trackAction({ user_id: user.id, session_id: sessionId, task_id: selectedTask?.id, stage: currentStage,
        action_type: "block_click", action_detail: { block_id: block.block_id, block_type: block.block_type, color: block.color } });
    }
  };

  return (
    <Card size="small" hoverable onClick={handleClick}
      style={{ cursor: "pointer", borderLeft: `4px solid ${color}`, borderRadius: 10, marginBottom: 6,
        borderColor: expanded ? color : "#e9ecef", borderWidth: expanded ? 2 : 1, transition: "all 0.2s",
        boxShadow: expanded ? "0 2px 8px rgba(0,0,0,0.06)" : "none" }}
      styles={{ body: { padding: "10px 14px" } }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          {block.block_type.charAt(0)}
        </div>
        <Text strong style={{ fontSize: 14 }}>{block.block_type}</Text>
        <Tag color={color} style={{ marginLeft: "auto", fontSize: 11, borderRadius: 6 }}>{colorLabelMap[block.color]}</Tag>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f3f5" }} className="animate-fadeIn">
          <div style={{ padding: "10px 14px", background: "#1e1e2e", borderRadius: 8 }}>
            <Text style={{ color: "#cdd6f4", fontFamily: "Consolas, monospace", fontSize: 13, whiteSpace: "pre-wrap", display: "block" }}>{block.python_code}</Text>
          </div>
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13, lineHeight: 1.7 }}>{block.explanation}</Paragraph>
        </div>
      )}
    </Card>
  );
}

function SubtaskPanel({ subtask, index }: { subtask: Subtask; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const user = useAppStore((s) => s.user);
  const sessionId = useAppStore((s) => s.sessionId);
  const currentStage = useAppStore((s) => s.currentStage);
  const selectedTask = useAppStore((s) => s.selectedTask);

  const handleToggle = () => {
    setExpanded(!expanded);
    if (!expanded && user) {
      trackAction({ user_id: user.id, session_id: sessionId, task_id: selectedTask?.id, stage: currentStage,
        action_type: "subtask_click", action_detail: { subtask_id: subtask.id, subtask_title: subtask.title } });
    }
  };

  return (
    <Card hoverable onClick={handleToggle}
      style={{ marginBottom: 10, borderRadius: 12, border: expanded ? "2px solid #4361ee" : "1px solid #e9ecef",
        boxShadow: expanded ? "0 4px 16px rgba(67,97,238,0.08)" : "0 1px 3px rgba(0,0,0,0.03)",
        transition: "all 0.2s" }}
      styles={{ body: { padding: "14px 18px" } }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: expanded ? "linear-gradient(135deg, #4361ee, #7209b7)" : "#f1f3f5",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: expanded ? "#fff" : "#636e72", fontSize: 16, fontWeight: 700, transition: "all 0.2s" }}>
          {expanded ? <DownOutlined style={{ fontSize: 14 }} /> : index + 1}
        </div>
        <Text strong style={{ fontSize: 15, flex: 1, color: expanded ? "#4361ee" : "#2d3436" }}>{subtask.title}</Text>
        {expanded ? <DownOutlined style={{ color: "#4361ee", transition: "transform 0.2s" }} />
          : <RightOutlined style={{ color: "#b2bec3", transition: "transform 0.2s" }} />}
      </div>
      {expanded && (
        <div style={{ paddingTop: 14, marginTop: 12, borderTop: "1px solid #f1f3f5" }}>
          {subtask.blocks.map((block) => <BlockCard key={block.block_id} block={block} />)}
        </div>
      )}
    </Card>
  );
}

interface PStagePanelProps { subtasks: Subtask[] | undefined; }

export default function PStagePanel({ subtasks }: PStagePanelProps) {
  if (!subtasks) {
    return <div style={{ background: "#f8f9fa", borderRadius: 12, padding: 40, textAlign: "center" }}>
      <Empty description="Loading task content..." />
    </div>;
  }
  return <>{subtasks.map((s, idx) => <SubtaskPanel key={s.id} subtask={s} index={idx} />)}</>;
}
