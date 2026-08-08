import { useEffect, useRef, useState } from "react";
import { Typography, Empty, Tag, Card } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { CSSProperties } from "react";
import type { Subtask, BlockMapping } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { trackAction } from "../../services/trackService";
import { colorMap, colorLabelMap } from "./constants";
import { P_STEP_DWELL_MS } from "../../utils/agentSupport";

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
      className={`block-card ${expanded ? "is-open" : ""}`}
      style={{ "--block-color": color } as CSSProperties}
      styles={{ body: { padding: 0 } }}>
      <div className="block-card-summary">
        <div className="block-chip" aria-hidden="true" />
        <Text strong className="block-card-title">{block.block_type}</Text>
        <Tag className="block-category-tag">{block.drawer_category}</Tag>
        <Tag color={color} className="block-card-tag">{colorLabelMap[block.color]}</Tag>
      </div>
      {expanded && (
        <div className="block-card-details animate-fadeIn">
          <div className="block-detail-section">
            <Text className="block-detail-label">这块积木做什么</Text>
            <Paragraph className="block-detail-text">{block.meaning}</Paragraph>
          </div>
          <div className="block-detail-section">
            <Text className="block-detail-label">积木与 Python 的对应关系</Text>
            <Paragraph className="block-detail-text">{block.translation_rule}</Paragraph>
          </div>
          <Text className="block-detail-label">看一个小例子</Text>
          <div className="block-code-preview">
            <pre>{block.python_code}</pre>
          </div>
          <div className="block-connection-note">
            <b>连接提示：</b>{block.explanation}
          </div>
        </div>
      )}
    </Card>
  );
}

function SubtaskPanel({ subtask, index }: { subtask: Subtask; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [agentFocus, setAgentFocus] = useState(false);
  const dwellTimerRef = useRef<number | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const user = useAppStore((s) => s.user);
  const sessionId = useAppStore((s) => s.sessionId);
  const currentStage = useAppStore((s) => s.currentStage);
  const selectedTask = useAppStore((s) => s.selectedTask);

  useEffect(() => {
    if (!expanded || !user || !selectedTask || currentStage !== "P") return;
    const storageKey = `blockpython:p-step:${user.id}:${selectedTask.id}:${subtask.id}`;
    if (sessionStorage.getItem(storageKey)) return;

    const schedule = (delay: number) => {
      dwellTimerRef.current = window.setTimeout(() => {
        const state = useAppStore.getState();
        if (state.currentStage !== "P" || state.selectedTask?.id !== selectedTask.id) return;
        if (state.pendingSystemMessage || state.learningActivity.chatSending) {
          schedule(1500);
          return;
        }
        sessionStorage.setItem(storageKey, "1");
        setAgentFocus(true);
        state.setPendingSystemMessage({
          target_stage: "P",
          trigger: "p_step_explanation",
          step_id: subtask.id,
          request_key: `${selectedTask.id}:P:p-step:${subtask.id}:${sessionId}`,
        });
        trackAction({
          user_id: user.id,
          session_id: sessionId,
          task_id: selectedTask.id,
          stage: "P",
          action_type: "p_step_explanation_triggered",
          action_detail: { subtask_id: subtask.id, dwell_ms: P_STEP_DWELL_MS },
        });
        focusTimerRef.current = window.setTimeout(() => setAgentFocus(false), 12000);
      }, delay);
    };

    schedule(P_STEP_DWELL_MS);
    return () => {
      if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
      if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    };
  }, [currentStage, expanded, selectedTask, sessionId, subtask.id, user]);

  const handleToggle = () => {
    setExpanded(!expanded);
    if (!expanded && user) {
      trackAction({ user_id: user.id, session_id: sessionId, task_id: selectedTask?.id, stage: currentStage,
        action_type: "subtask_click", action_detail: { subtask_id: subtask.id, subtask_title: subtask.title } });
    }
  };

  return (
    <Card hoverable onClick={handleToggle}
      className={`subtask-card ${expanded ? "is-open" : ""} ${agentFocus ? "is-agent-focus" : ""}`}
      styles={{ body: { padding: 0 } }}>
      <div className="subtask-summary">
        <div className="subtask-node">
          {expanded ? <DownOutlined style={{ fontSize: 14 }} /> : index + 1}
        </div>
        <Text strong className="subtask-title">{subtask.title}</Text>
        {expanded ? <DownOutlined className="subtask-chevron" />
          : <RightOutlined className="subtask-chevron" />}
      </div>
      {expanded && (
        <div className="subtask-details animate-fadeIn">
          <p className="subtask-objective">{subtask.objective}</p>
          {subtask.blocks.map((block) => <BlockCard key={block.block_id} block={block} />)}
          {subtask.concepts && (
            <div className="learning-guide-concepts subtask-concepts" aria-label="本步骤知识点">
              {subtask.concepts.map((concept) => <span key={concept}>{concept}</span>)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

interface PStagePanelProps { subtasks: Subtask[] | undefined; }

export default function PStagePanel({ subtasks }: PStagePanelProps) {
  if (!subtasks) {
    return <div className="stage-empty">
      <Empty description="正在加载任务内容..." />
    </div>;
  }
  return <div className="subtask-track">{subtasks.map((s, idx) => <SubtaskPanel key={s.id} subtask={s} index={idx} />)}</div>;
}
