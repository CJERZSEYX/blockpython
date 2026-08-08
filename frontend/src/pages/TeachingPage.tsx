import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Spin } from "antd";
import { useAppStore } from "../store/useAppStore";
import TeachingLayout from "../components/Layout/TeachingLayout";
import { getTaskDetail, getCStageBlocks } from "../services/taskService";
import type { Stage, TaskContent } from "../types";
import type { BlocklyEditorHandle } from "../components/BlocklyEditor/BlocklyEditor";
import { flushNow, trackAction } from "../services/trackService";
import { getLearningState, saveLearningDraft, saveLearningStage } from "../services/learningStateService";
import { setActiveLearningContext } from "../services/activeLearningTimer";

const stageConfig: Record<
  Stage,
  { blocklyReadOnly: boolean }
> = {
  P: { blocklyReadOnly: true },
  A: { blocklyReadOnly: false },
  C: { blocklyReadOnly: true },
  I: { blocklyReadOnly: true },
};

export default function TeachingPage() {
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();
  const routeTaskId = Number(taskId);
  const hasValidTaskId = Number.isInteger(routeTaskId) && routeTaskId > 0;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const blocklyRef = useRef<BlocklyEditorHandle>(null);
  const prevStageRef = useRef<Stage>("P");
  const stageEnteredAtRef = useRef<number | null>(null);
  const taskEnteredAtRef = useRef<number | null>(null);
  const leaveLoggedRef = useRef(false);
  const leaveCleanupTimerRef = useRef<number | null>(null);
  const loadRequestRef = useRef(0);
  const stageChangeRequestRef = useRef(0);
  const {
    user,
    sessionId,
    selectedTask,
    currentStage,
    setSelectedTask,
    setStage,
    setBlocklyReadOnly,
    setTaskContent,
    setPendingSystemMessage,
    setSavedAWorkspace,
    setCStageBlocksXml,
    savedAWorkspace,
    cStageBlocksXml,
    taskContent,
    learningState,
    applyLearningState,
    currentBlocklyXml,
    pythonCode,
    iPythonCode,
  } = useAppStore();

  const loadAll = useCallback(async () => {
    if (!user || !hasValidTaskId) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError("");
    try {
      const [task, restoredState] = await Promise.all([
        getTaskDetail(routeTaskId),
        getLearningState(routeTaskId),
      ]);
      if (requestId !== loadRequestRef.current) return;
      const taskChanged = useAppStore.getState().selectedTask?.id !== task.id;
      if (taskChanged) blocklyRef.current?.clearWorkspace();
      setSelectedTask(task);
      applyLearningState(restoredState);
      const initialStage: Stage = "P";
      setStage(initialStage);
      setTaskContent(task.content_json as TaskContent);
      trackAction({
        user_id: user.id,
        session_id: sessionId,
        task_id: task.id,
        stage: initialStage,
        action_type: "task_open",
        action_detail: {
          task_version: task.version,
          previous_stage: restoredState.last_stage,
        },
      });
      const pTriggerKey = `${task.id}-${initialStage}`;
      const teachingState = useAppStore.getState();
      if (!teachingState.triggeredStages.has(pTriggerKey)) {
        teachingState.markStageTriggered(initialStage);
        setPendingSystemMessage({
          target_stage: initialStage,
          trigger: "stage_intro",
          request_key: `${task.id}:${initialStage}:stage_intro:context`,
        });
      }
      if (restoredState.a_completed) {
        getCStageBlocks(task.id).then((d) => {
          if (requestId === loadRequestRef.current && d?.blocks_xml) {
            setCStageBlocksXml(d.blocks_xml);
          }
        }).catch(() => {});
      }
    } catch {
      if (requestId !== loadRequestRef.current) return;
      setTaskContent(null);
      setCStageBlocksXml("");
      setLoadError("任务内容没有加载成功，请检查后端服务后重试。");
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [
    hasValidTaskId,
    routeTaskId,
    sessionId,
    setCStageBlocksXml,
    applyLearningState,
    setPendingSystemMessage,
    setSelectedTask,
    setStage,
    setTaskContent,
    user,
  ]);

  useEffect(() => {
    taskEnteredAtRef.current = Date.now();
    stageEnteredAtRef.current = null;
    leaveLoggedRef.current = false;
    prevStageRef.current = "P";
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    if (!hasValidTaskId) return;
    const timer = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(timer);
  }, [hasValidTaskId, loadAll, navigate, user]);

  // 学习状态恢复也会改变只读状态，因此不要在这个副作用中记录阶段事件。
  useEffect(() => {
    const config = stageConfig[currentStage];
    setBlocklyReadOnly(config.blocklyReadOnly || (currentStage === "A" && Boolean(learningState?.a_reference_hidden)));
  }, [currentStage, learningState?.a_reference_hidden, setBlocklyReadOnly]);

  // 只有任务或阶段真正变化时才记录进入、退出事件。
  useEffect(() => {
    const userId = user?.id;
    const selectedTaskId = selectedTask?.id;
    if (!userId || !selectedTaskId) return;
    const prev = prevStageRef.current;
    if (stageEnteredAtRef.current == null) stageEnteredAtRef.current = Date.now();

    if (prev && prev !== currentStage) {
      trackAction({
        user_id: userId, session_id: sessionId, task_id: selectedTaskId,
        stage: prev, action_type: "stage_exit",
        duration_ms: Date.now() - stageEnteredAtRef.current,
      });
      stageEnteredAtRef.current = Date.now();
    }
    trackAction({
      user_id: userId, session_id: sessionId, task_id: selectedTaskId,
      stage: currentStage, action_type: "stage_enter",
    });
  }, [currentStage, selectedTask?.id, sessionId, user?.id]);

  useEffect(() => {
    if (!user || !selectedTask) return;
    setActiveLearningContext({
      userId: user.id,
      sessionId,
      taskId: selectedTask.id,
      stage: currentStage,
    });
    return () => setActiveLearningContext(null);
  }, [currentStage, selectedTask, sessionId, user]);

  useEffect(() => {
    if (!selectedTask || !learningState?.a_completed || cStageBlocksXml) return;
    getCStageBlocks(selectedTask.id)
      .then((data) => setCStageBlocksXml(data.blocks_xml || ""))
      .catch(() => {});
  }, [cStageBlocksXml, learningState?.a_completed, selectedTask, setCStageBlocksXml]);

  useEffect(() => {
    if (!selectedTask || !["A", "C", "I"].includes(currentStage)) return;
    const content = currentStage === "A"
      ? currentBlocklyXml
      : currentStage === "C"
        ? pythonCode
        : iPythonCode;
    const timer = window.setTimeout(() => {
      void saveLearningDraft(selectedTask.id, currentStage as "A" | "C" | "I", content);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [currentBlocklyXml, currentStage, iPythonCode, pythonCode, selectedTask]);

  const saveCurrentDraft = useCallback(async () => {
    if (!selectedTask || !["A", "C", "I"].includes(currentStage)) return;
    const content = currentStage === "A"
      ? blocklyRef.current?.getXml() || currentBlocklyXml
      : currentStage === "C"
        ? pythonCode
        : iPythonCode;
    await saveLearningDraft(selectedTask.id, currentStage as "A" | "C" | "I", content).catch(() => undefined);
  }, [currentBlocklyXml, currentStage, iPythonCode, pythonCode, selectedTask]);

  const logLeavingTask = useCallback(() => {
    if (leaveLoggedRef.current || !user || !selectedTask) return;
    leaveLoggedRef.current = true;
    const now = Date.now();
    const stageAtLeave = useAppStore.getState().currentStage;
    trackAction({
      user_id: user.id,
      session_id: sessionId,
      task_id: selectedTask.id,
      stage: stageAtLeave,
      action_type: "stage_exit",
      duration_ms: stageEnteredAtRef.current == null ? undefined : now - stageEnteredAtRef.current,
      action_detail: { reason: "leave_task" },
    });
    trackAction({
      user_id: user.id,
      session_id: sessionId,
      task_id: selectedTask.id,
      stage: stageAtLeave,
      action_type: "task_exit",
      duration_ms: taskEnteredAtRef.current == null ? undefined : now - taskEnteredAtRef.current,
    });
  }, [selectedTask, sessionId, user]);

  useEffect(() => {
    if (leaveCleanupTimerRef.current != null) {
      window.clearTimeout(leaveCleanupTimerRef.current);
      leaveCleanupTimerRef.current = null;
    }
    const handlePageHide = () => logLeavingTask();
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      // StrictMode和依赖刷新会模拟清理；替代副作用会立即取消此计时器。
      leaveCleanupTimerRef.current = window.setTimeout(logLeavingTask, 0);
    };
  }, [logLeavingTask]);

  // 阶段切换：保存A积木、切换时清空工作区、只恢复A↔C
  useEffect(() => {
    const prev = prevStageRef.current;
    const stageChanged = prev !== currentStage;
    if (!stageChanged && !cStageBlocksXml) return;
    if (stageChanged) prevStageRef.current = currentStage;

    // 离开 A 时保存
    if (stageChanged && prev === "A") {
      setSavedAWorkspace(blocklyRef.current?.getXml() || "");
    }
    // 进入 A 时恢复
    if (currentStage === "A" && savedAWorkspace) {
      setTimeout(() => blocklyRef.current?.loadXml(savedAWorkspace), 150);
      return;
    }
    // C/I 展示完整的只读参考积木。
    if (currentStage === "C" || currentStage === "I") {
      if (cStageBlocksXml) {
        setTimeout(() => blocklyRef.current?.loadXml(cStageBlocksXml), 150);
      } else {
        setTimeout(() => blocklyRef.current?.clearWorkspace(), 150);
      }
      return;
    }

    // P 保持只读空白；A 保持可编辑空白并从抽屉中自主搭建。
    setTimeout(() => blocklyRef.current?.clearWorkspace(), 150);

  // savedAWorkspace is intentionally excluded: Blockly publishes a new draft
  // during every drag. Reloading that draft here would clear and rebuild the
  // workspace while the pointer is still moving.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStage, cStageBlocksXml, setSavedAWorkspace]);

  if (!user) {
    return <div style={{ padding: 40, textAlign: "center" }}>加载中...</div>;
  }

  if (!hasValidTaskId || loadError) {
    return (
      <div className="teaching-load-state">
        <Alert
          type="error"
          showIcon
          title="任务暂时无法打开"
          description={hasValidTaskId ? loadError : "任务编号无效。"}
        />
        <div>
          <Button onClick={() => navigate("/tasks")}>返回任务中心</Button>
          {hasValidTaskId && <Button type="primary" onClick={() => void loadAll()}>重新加载</Button>}
        </div>
      </div>
    );
  }

  if (loading || !selectedTask || selectedTask.id !== routeTaskId || !taskContent) {
    return <div className="teaching-load-state"><Spin size="large" /><span>正在准备任务...</span></div>;
  }

  return (
    <TeachingLayout
      blocklyRef={blocklyRef}
      selectedTask={selectedTask}
      currentStage={currentStage}
      userId={user.id}
      sessionId={sessionId}
      onStageChange={async (s) => {
        if (s === "C" && !learningState?.a_completed) return;
        if (s === "I" && !learningState?.c_completed) return;
        const requestId = ++stageChangeRequestRef.current;
        const previousStage = useAppStore.getState().currentStage;
        const draftSave = saveCurrentDraft();
        const logFlush = flushNow();
        setStage(s);
        await Promise.allSettled([draftSave, logFlush]);
        try {
          const nextState = await saveLearningStage(selectedTask.id, s);
          if (requestId !== stageChangeRequestRef.current) return;
          applyLearningState(nextState);
        } catch {
          if (requestId === stageChangeRequestRef.current) setStage(previousStage);
        }
      }}
      onBack={() => {
        void (async () => {
          await Promise.allSettled([saveCurrentDraft(), flushNow()]);
          logLeavingTask();
          navigate("/tasks");
        })();
      }}
      taskContent={taskContent}
    />
  );
}
