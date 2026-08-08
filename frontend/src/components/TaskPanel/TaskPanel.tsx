import { Typography } from "antd";
import type { Stage, TaskContent } from "../../types";
import type { BlocklyEditorHandle } from "../BlocklyEditor/BlocklyEditor";
import PStagePanel from "./PStagePanel";
import AStagePanel from "./AStagePanel";
import CStagePanel from "./CStagePanel";
import IStagePanel from "./IStagePanel";
import { stageLabels } from "./constants";
import ExecutionVisualizer from "../ExecutionVisualizer/ExecutionVisualizer";
import LearningGuide from "./LearningGuide";
import { PartitionOutlined, PlayCircleOutlined, ExperimentOutlined, TeamOutlined } from "@ant-design/icons";

const { Paragraph } = Typography;

interface TaskPanelProps {
  stage: Stage;
  taskId: number;
  taskContent: TaskContent | null;
  blocklyRef: React.RefObject<BlocklyEditorHandle | null>;
}

export default function TaskPanel({ stage, taskContent, blocklyRef, taskId }: TaskPanelProps) {
  const content = stageLabels[stage];
  const stageIcon = {
    P: <PartitionOutlined />,
    A: <PlayCircleOutlined />,
    C: <ExperimentOutlined />,
    I: <TeamOutlined />,
  }[stage];

  return (
    <div className={`task-panel stage-${stage.toLowerCase()}`}>
      <div className="task-panel-heading">
        <span className="task-panel-index" aria-hidden="true">{stageIcon}</span>
        <div>
        <div className="task-panel-title">{content.title}</div>
        <Paragraph className="task-panel-desc">{content.description}</Paragraph>
        </div>
      </div>

      <div className="task-panel-content">
        {stage === "P" && (
          <>
            <LearningGuide guide={taskContent?.learning_guide} stage="P" />
            <PStagePanel subtasks={taskContent?.p_stage?.subtasks} />
            {taskContent?.visualization?.type && (
              <ExecutionVisualizer
                type={taskContent.visualization.type}
                visualization={taskContent.visualization}
                result={null}
                idleMessage="先阅读任务说明，后面的练习会在这里展示程序效果。"
              />
            )}
          </>
        )}
        {stage === "A" && <AStagePanel taskContent={taskContent} blocklyRef={blocklyRef} taskId={taskId} />}
        {stage === "C" && <CStagePanel taskContent={taskContent} taskId={taskId} />}
        {stage === "I" && <IStagePanel />}
      </div>
    </div>
  );
}
