import { Typography, Space } from "antd";
import type { Stage, TaskContent } from "../../types";
import type { BlocklyEditorHandle } from "../BlocklyEditor/BlocklyEditor";
import PStagePanel from "./PStagePanel";
import AStagePanel from "./AStagePanel";
import CStagePanel from "./CStagePanel";
import IStagePanel from "./IStagePanel";
import { stageLabels } from "./constants";
import { useAppStore } from "../../store/useAppStore";

const { Text, Paragraph } = Typography;

interface TaskPanelProps {
  stage: Stage;
  taskId: number;
  taskContent: TaskContent | null;
  blocklyRef: React.RefObject<BlocklyEditorHandle | null>;
}

export default function TaskPanel({ stage, taskContent, blocklyRef, taskId }: TaskPanelProps) {
  const content = stageLabels[stage];
  const selectedTask = useAppStore((s) => s.selectedTask);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ fontSize: 20, color: "#1677ff", display: "block", marginBottom: 8 }}>{content.title}</Text>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>{content.description}</Paragraph>
      </div>

      <Space orientation="vertical" style={{ width: "100%" }} size="large">
        {stage === "P" && (
          <>
            {selectedTask?.description && (
              <Paragraph type="secondary" style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 14 }}>
                Task: {selectedTask.description}
              </Paragraph>
            )}
            <PStagePanel subtasks={taskContent?.p_stage?.subtasks} />
          </>
        )}
        {stage === "A" && <AStagePanel taskContent={taskContent} blocklyRef={blocklyRef} taskId={taskId} />}
        {stage === "C" && <CStagePanel taskContent={taskContent} />}
        {stage === "I" && <IStagePanel />}
      </Space>
    </div>
  );
}
