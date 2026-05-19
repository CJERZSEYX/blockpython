import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import TeachingLayout from "../components/Layout/TeachingLayout";
import { getTaskDetail, getCStageBlocks } from "../services/taskService";
import type { Stage, TaskContent } from "../types";
import type { BlocklyEditorHandle } from "../components/BlocklyEditor/BlocklyEditor";
import { trackAction } from "../services/trackService";

const stageConfig: Record<
  Stage,
  { blocklyReadOnly: boolean; showCodeEditor: boolean; roleLabel: string }
> = {
  P: { blocklyReadOnly: false, showCodeEditor: false, roleLabel: "Instructor" },
  A: { blocklyReadOnly: false, showCodeEditor: false, roleLabel: "Coach" },
  C: { blocklyReadOnly: true, showCodeEditor: true, roleLabel: "Guide" },
  I: { blocklyReadOnly: false, showCodeEditor: false, roleLabel: "Partner" },
};

export default function TeachingPage() {
  const navigate = useNavigate();
  const blocklyRef = useRef<BlocklyEditorHandle>(null);
  const prevStageRef = useRef<Stage>("P");
  const {
    user,
    sessionId,
    selectedTask,
    currentStage,
    setStage,
    setBlocklyReadOnly,
    setShowCodeEditor,
    setTaskContent,
    setPendingSystemMessage,
    setSavedAWorkspace,
    setCStageBlocksXml,
    savedAWorkspace,
    cStageBlocksXml,
    taskContent,
  } = useAppStore();

  useEffect(() => {
    if (!user || !selectedTask) { navigate("/tasks"); return; }
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const task = await getTaskDetail(selectedTask!.id);
      setTaskContent(task.content_json as TaskContent);
      setPendingSystemMessage(
        `Introduce this task to the student: "${task.title}" — ${task.description}. Use a friendly tone to tell the student what they will learn in this lesson, which blocks they will use, and what they will be able to make. Keep it under 100 words.`
      );
      getCStageBlocks(selectedTask!.id).then((d) => {
        if (d?.blocks_xml) setCStageBlocksXml(d.blocks_xml);
      }).catch(() => {});
    } catch { console.error("Failed to load task"); }
  };

  useEffect(() => {
    const prev = prevStageRef.current;
    const config = stageConfig[currentStage];
    setBlocklyReadOnly(config.blocklyReadOnly);
    setShowCodeEditor(config.showCodeEditor);

    if (prev && prev !== currentStage) {
      trackAction({
        user_id: user!.id, session_id: sessionId, task_id: selectedTask!.id,
        stage: prev, action_type: "stage_exit",
      });
    }
    trackAction({
      user_id: user!.id, session_id: sessionId, task_id: selectedTask!.id,
      stage: currentStage, action_type: "stage_enter",
    });
  }, [currentStage]);

  useEffect(() => {
    const prev = prevStageRef.current;
    if (prev === currentStage) return;
    prevStageRef.current = currentStage;

    if (prev === "A") {
      setSavedAWorkspace(blocklyRef.current?.getXml() || "");
    }
    if (currentStage === "A" && savedAWorkspace) {
      setTimeout(() => blocklyRef.current?.loadXml(savedAWorkspace), 150);
      return;
    }
    if (currentStage === "C") {
      if (cStageBlocksXml) {
        setTimeout(() => blocklyRef.current?.loadXml(cStageBlocksXml), 150);
      }
      return;
    }
    setTimeout(() => blocklyRef.current?.clearWorkspace(), 150);
  }, [currentStage, cStageBlocksXml]);

  if (!user || !selectedTask) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;
  }

  return (
    <TeachingLayout
      blocklyRef={blocklyRef}
      selectedTask={selectedTask}
      currentStage={currentStage}
      roleLabel={stageConfig[currentStage].roleLabel}
      userId={user.id}
      sessionId={sessionId}
      onStageChange={(s) => setStage(s)}
      onBack={() => navigate("/tasks")}
      taskContent={taskContent}
    />
  );
}
