import { Button, Space } from "antd";
import { PartitionOutlined, PlayCircleOutlined, ExperimentOutlined, TeamOutlined, CheckCircleFilled } from "@ant-design/icons";
import type { Stage } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { updateStage } from "../../services/taskService";

interface StageButtonsProps { currentStage: Stage; onStageChange: (stage: Stage) => void; }

const stageTriggers: Record<string, string> = {
  P: `You are a programming teacher. Introduce the task goal to the student, break it into sub-tasks, and explain the blocks for each sub-task. Keep it within 5 sentences.`,
  A: `You are a coach. Briefly tell the student: now build blocks from the Python code. Encourage them to try on their own, and ask you if they get stuck. Keep it within 3 sentences.`,
  C: `You are a guide. Briefly tell the student: look at the block diagram on the left and write the corresponding Python code. You can answer questions but won't give code directly. Keep it within 3 sentences.`,
};

const stageMeta: Record<Stage, { label: string; icon: React.ReactNode; color: string }> = {
  P: { label: "Breakdown", icon: <PartitionOutlined />, color: "#4361ee" },
  A: { label: "Practice", icon: <PlayCircleOutlined />, color: "#ff9f1c" },
  C: { label: "Challenge", icon: <ExperimentOutlined />, color: "#2ec4b6" },
  I: { label: "Interact", icon: <TeamOutlined />, color: "#7209b7" },
};

export default function StageButtons({ currentStage, onStageChange }: StageButtonsProps) {
  const completedStages = useAppStore((s) => s.completedStages);
  const triggeredStages = useAppStore((s) => s.triggeredStages);
  const setPendingSystemMessage = useAppStore((s) => s.setPendingSystemMessage);
  const taskContent = useAppStore((s) => s.taskContent);
  const user = useAppStore((s) => s.user);
  const selectedTask = useAppStore((s) => s.selectedTask);
  const markStageCompleted = useAppStore((s) => s.markStageCompleted);
  const markStageTriggered = useAppStore((s) => s.markStageTriggered);
  const tid = selectedTask?.id || 0;

  const handleClick = (target: Stage) => {
    if (selectedTask && user?.id) { updateStage(user.id, selectedTask.id, target).catch(() => {}); }
    if (currentStage === "P" && target === "A") { markStageCompleted("P"); }
    const triggerKey = `${tid}-${target}`;
    if (target !== currentStage || target === "P") {
      const trigger = stageTriggers[target];
      if (trigger && !triggeredStages.has(triggerKey)) {
        markStageTriggered(target);
        if (target === "P" && taskContent) {
          const names = taskContent.p_stage.subtasks.map((s) => s.title).join(", ");
          setPendingSystemMessage(`You are a programming teacher. Introduce the task goal, break down the following sub-tasks: ${names}, and explain the blocks for each sub-task. Keep it within 5 sentences.`);
        } else if (target !== "P") { setPendingSystemMessage(trigger); }
      }
    }
    onStageChange(target);
  };

  return (
    <Space size={8}>
      {(["P","A","C","I"] as Stage[]).map((stage) => {
        const meta = stageMeta[stage];
        const isCurrent = stage === currentStage;
        const isCompleted = completedStages.has(`${tid}-${stage}`);
        const isNext = !isCurrent && !isCompleted &&
          (stage === "P" || completedStages.has(`${tid}-${String.fromCharCode(stage.charCodeAt(0)-1)}`));

        return (
          <Button key={stage}
            type={isCurrent ? "primary" : "default"}
            size="small"
            icon={isCompleted ? <CheckCircleFilled style={{ color: "#2ec4b6" }} /> : meta.icon}
            onClick={() => handleClick(stage)}
            style={{
              borderRadius: 20, fontWeight: isCurrent ? 600 : 400, padding: "4px 16px",
              borderColor: isNext ? meta.color : isCurrent ? undefined : "#dee2e6",
              borderWidth: isNext ? 2 : 1,
              color: isCurrent ? undefined : isNext ? meta.color : "#636e72",
              background: isCompleted ? "#f0fdf6" : undefined,
              transition: "all 0.2s",
              transform: isCurrent ? "scale(1.05)" : "scale(1)",
            }}>
            {meta.label}
          </Button>
        );
      })}
    </Space>
  );
}
