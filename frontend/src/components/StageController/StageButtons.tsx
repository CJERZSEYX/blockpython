import { Button, Tooltip } from "antd";
import type { CSSProperties } from "react";
import { PartitionOutlined, PlayCircleOutlined, ExperimentOutlined, TeamOutlined, LockOutlined, CheckCircleFilled } from "@ant-design/icons";
import type { Stage } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { useEffect, useRef } from "react";
import { notifyRepeatedOperation } from "../../utils/operationGate";

interface StageButtonsProps { currentStage: Stage; onStageChange: (stage: Stage) => void | Promise<void>; }

const stageMeta: Record<Stage, { label: string; icon: React.ReactNode; color: string }> = {
  P: { label: "任务分解", icon: <PartitionOutlined />, color: "#4361ee" },
  A: { label: "开始练习", icon: <PlayCircleOutlined />, color: "#ff9f1c" },
  C: { label: "代码挑战", icon: <ExperimentOutlined />, color: "#2ec4b6" },
  I: { label: "拓展互动", icon: <TeamOutlined />, color: "#7209b7" },
};

export default function StageButtons({ currentStage, onStageChange }: StageButtonsProps) {
  const setPendingSystemMessage = useAppStore((s) => s.setPendingSystemMessage);
  const selectedTask = useAppStore((s) => s.selectedTask);
  const markStageTriggered = useAppStore((s) => s.markStageTriggered);
  const tid = selectedTask?.id || 0;
  const learningState = useAppStore((s) => s.learningState);
  const introTimerRef = useRef<number | null>(null);
  const switchRequestRef = useRef(0);

  useEffect(() => () => {
    if (introTimerRef.current) window.clearTimeout(introTimerRef.current);
  }, []);

  const handleClick = async (target: Stage) => {
    if (target === currentStage) {
      notifyRepeatedOperation("当前已经是这个学习阶段，请勿重复点击");
      return;
    }
    const requestId = ++switchRequestRef.current;
    if (introTimerRef.current) window.clearTimeout(introTimerRef.current);
    await onStageChange(target);
    if (requestId !== switchRequestRef.current) return;
    introTimerRef.current = window.setTimeout(() => {
      const latest = useAppStore.getState();
      const triggerKey = `${tid}-${target}`;
      const completedCodeStage = target === "C" && Boolean(latest.learningState?.c_completed);
      if (
        latest.currentStage !== target
        || target === "I"
        || completedCodeStage
        || latest.triggeredStages.has(triggerKey)
      ) return;
      markStageTriggered(target);
      setPendingSystemMessage({
        target_stage: target,
        trigger: "stage_intro",
        request_key: `${tid}:${target}:stage_intro:context`,
      });
    }, 300);
  };

  return (
    <div className="stage-track">
      <div className="stage-track-line" aria-hidden="true" />
      {(["P","A","C","I"] as Stage[]).map((stage) => {
        const meta = stageMeta[stage];
        const isCurrent = stage === currentStage;
        const locked = (stage === "C" && !learningState?.a_completed)
          || (stage === "I" && !learningState?.c_completed);
        const completed = (stage === "A" && learningState?.a_completed)
          || (stage === "C" && learningState?.c_completed);
        const lockReason = stage === "C" ? "完成开始练习后解锁" : "完成代码挑战后解锁";

        return (
          <Tooltip key={stage} title={locked ? lockReason : ""}>
            <span className="stage-tab-wrap" title={locked ? lockReason : undefined}>
              <Button
                type={isCurrent ? "primary" : "default"}
                className={`stage-tab ${isCurrent ? "is-current" : ""} ${completed ? "is-completed" : ""}`}
                icon={locked ? <LockOutlined /> : meta.icon}
                onClick={() => void handleClick(stage)}
                disabled={locked}
                aria-label={locked ? `${meta.label}，${lockReason}` : meta.label}
                style={{ "--stage-color": meta.color } as CSSProperties}>
                <span className="stage-tab-label">{meta.label}</span>
                {completed && <CheckCircleFilled className="stage-complete-icon" aria-label="已完成" />}
              </Button>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
