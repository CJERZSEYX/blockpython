import { useCallback, useEffect, useRef, useState } from "react";
import { Typography, Space, Button, Tag } from "antd";
import { ExperimentOutlined, PlayCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import type { ExecutionResult, SupportRequest, TaskContent } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { executeProgram } from "../../services/submitService";
import { trackAction } from "../../services/trackService";
import ExecutionVisualizer from "../ExecutionVisualizer/ExecutionVisualizer";
import { getFriendlyFeedback } from "../../utils/executionFeedback";
import LearningGuide from "./LearningGuide";
import RuntimeProgramInput from "./RuntimeProgramInput";
import { executionAnchor } from "../../utils/agentAnchor";
import {
  artifactFingerprint,
  notifyRepeatedOperation,
  recordSuppressedOperation,
  type OperationLease,
  useOperationGate,
} from "../../utils/operationGate";

const { Text, Paragraph } = Typography;

interface CStagePanelProps {
  taskContent: TaskContent | null;
  taskId: number;
}

export default function CStagePanel({ taskContent, taskId }: CStagePanelProps) {
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<ExecutionResult | null>(null);
  const [runAttempts, setRunAttempts] = useState(0);
  const [programInput, setProgramInput] = useState("");
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const pythonCode = useAppStore((state) => state.pythonCode);
  const setPythonCode = useAppStore((state) => state.setPythonCode);
  const setPendingSystemMessage = useAppStore((state) => state.setPendingSystemMessage);
  const setAgentAnchor = useAppStore((state) => state.setAgentAnchor);
  const setLearningActivity = useAppStore((state) => state.setLearningActivity);
  const user = useAppStore((state) => state.user);
  const sessionId = useAppStore((state) => state.sessionId);
  const chatMessages = useAppStore((state) => state.chatMessages);
  const visualizationType = taskContent?.visualization?.type || "console";
  const resultRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const agentAnchor = useAppStore((state) => state.agentAnchor);
  const artifactRevision = useAppStore((state) => state.artifactRevision);
  const playbackActive = useAppStore((state) => state.learningActivity.playbackActive);
  const acquireOperation = useOperationGate();
  const applyLearningState = useAppStore((state) => state.applyLearningState);
  const inputLeaseRef = useRef<OperationLease | null>(null);
  const pendingRunFeedbackRef = useRef<{ artifactHash: string; message: SupportRequest } | null>(null);

  const deliverRunFeedback = useCallback(() => {
    const pending = pendingRunFeedbackRef.current;
    if (!pending) return;
    pendingRunFeedbackRef.current = null;
    const latest = useAppStore.getState();
    if (latest.currentStage !== "C" || artifactFingerprint(latest.pythonCode) !== pending.artifactHash) return;
    setPendingSystemMessage(pending.message);
  }, [setPendingSystemMessage]);
  useEffect(() => {
    if (!runResult) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [runResult]);
  useEffect(() => {
    setLearningActivity({ running, inputOpen: inputDialogOpen });
    return () => setLearningActivity({ running: false, inputOpen: false });
  }, [inputDialogOpen, running, setLearningActivity]);
  useEffect(() => {
    if (!user || !pythonCode.trim()) return;
    const timer = window.setTimeout(() => {
      const latest = useAppStore.getState();
      if (latest.currentStage !== "C" || latest.pythonCode !== pythonCode) return;
      trackAction({
        user_id: user.id,
        session_id: sessionId,
        task_id: taskId,
        stage: "C",
        action_type: "c_code_snapshot",
        action_detail: { code: pythonCode, artifact_revision: latest.artifactRevision },
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [pythonCode, sessionId, taskId, user]);
  useEffect(() => {
    if (agentAnchor?.stage !== "C" || !agentAnchor.line || !codeRef.current) return;
    const lines = pythonCode.split(/\r?\n/);
    const start = lines.slice(0, agentAnchor.line - 1).reduce((total, line) => total + line.length + 1, 0);
    const end = start + (lines[agentAnchor.line - 1]?.length || 0);
    codeRef.current.focus();
    codeRef.current.setSelectionRange(start, end);
  }, [agentAnchor, pythonCode]);

  const runProgram = async (inputValue: string, lease: OperationLease) => {
    const submittedCode = pythonCode;
    const artifactHash = artifactFingerprint(submittedCode);
    const submittedVersion = artifactRevision;
    const nextAttempt = runAttempts + 1;
    pendingRunFeedbackRef.current = null;
    setLearningActivity({ running: true, lastMeaningfulActionAt: Date.now() });
    setRunning(true);
    setRunAttempts(nextAttempt);
    try {
      const response = await executeProgram({
        task_id: taskId,
        stage: "C",
        code: submittedCode,
        input: inputValue,
        attempt: nextAttempt,
        operation_id: lease.operationId,
        artifact_hash: artifactHash,
        artifact_version: submittedVersion,
      });
      const latest = useAppStore.getState();
      if (latest.currentStage !== "C" || artifactFingerprint(latest.pythonCode) !== artifactHash) return;
      setRunResult(response);
      if (response.learning_state) applyLearningState(response.learning_state);
      setAgentAnchor(executionAnchor("C", response));
      if (response.status === "target_met" || response.agent_intervention_recommended) {
        const message: SupportRequest = {
          target_stage: "C",
          trigger: "run_feedback",
          attempt: nextAttempt,
          run_outcome: response.status,
          error_line: response.line,
          student_code: submittedCode,
          artifact_version: response.artifact_version,
          diagnosis_code: response.learning_diagnostics?.find((item) => !item.resolved)?.code,
          diagnosis_occurrence: response.diagnosis_occurrence,
          evidence_ids: response.learning_diagnostics?.flatMap((item) => item.evidence_ids),
        };
        if (
          visualizationType === "variable_map" &&
          response.started &&
          response.events.some((event) => event.type === "stage")
        ) {
          pendingRunFeedbackRef.current = { artifactHash, message };
        } else {
          setPendingSystemMessage(message);
        }
      }
    } catch {
      // Keep service failures in the deterministic result area.
    } finally {
      setRunning(false);
      lease.release();
    }
  };

  const handleRun = () => {
    if (playbackActive) {
      notifyRepeatedOperation("程序正在展示结果，请勿重复运行");
      return;
    }
    const lease = acquireOperation("c_run");
    if (!lease) return;
    if (taskContent?.c_stage?.requires_input) {
      inputLeaseRef.current = lease;
      setLearningActivity({ inputOpen: true, lastMeaningfulActionAt: Date.now() });
      setInputDialogOpen(true);
      return;
    }
    void runProgram("", lease);
  };

  const handleAskForHint = () => {
    const lease = acquireOperation("c_hint");
    if (!lease) return;
    const hintArtifact = `C:${artifactFingerprint(pythonCode)}`;
    if (chatMessages.some((message) => message.role === "assistant" && message.artifact_token === hintArtifact)) {
      recordSuppressedOperation("c_hint_same_artifact", "当前代码已有提示，请先修改后再请求");
      lease.release();
      return;
    }
    trackAction({
      user_id: user!.id,
      session_id: sessionId,
      task_id: taskId,
      stage: "C",
      action_type: "c_hint_request",
      action_detail: { attempts_so_far: runAttempts, code_length: pythonCode.length },
    });
    setPendingSystemMessage({
      target_stage: "C",
      trigger: "hint_request",
      attempt: runAttempts,
      student_code: pythonCode,
      request_key: `${taskId}:C:hint_request:${artifactFingerprint(pythonCode)}`,
    });
    lease.release();
  };

  return (
    <>
      <div className="stage-card challenge challenge-brief stage-task-window">
        <div className="challenge-heading">
          <span className="challenge-symbol" aria-hidden="true"><ExperimentOutlined /></span>
          <Text strong className="stage-section-title">{taskContent?.c_stage?.title || "进阶挑战"}</Text>
        </div>
        <Paragraph className="challenge-description stage-section-description">{taskContent?.c_stage?.description || ""}</Paragraph>
        <LearningGuide guide={taskContent?.learning_guide} stage="C" />
        <Button
          className="hint-action-button"
          icon={<QuestionCircleOutlined />}
          onClick={handleAskForHint}
          disabled={running}
        >
          请求过程提示
        </Button>
      </div>

      <div className="code-shell">
        <div className="code-shell-title">
          <span className="code-status-dot" />
          {agentAnchor?.stage === "C" && agentAnchor.label && (
            <Tag className="agent-anchor-label">{agentAnchor.label}</Tag>
          )}
          Python代码
          {runResult?.line && <Tag color="error">检查第 {runResult.line} 行</Tag>}
        </div>
        <textarea
          ref={codeRef}
          value={pythonCode}
          onChange={(event) => setPythonCode(event.target.value)}
          className="code-textarea"
          placeholder="# 观察左侧完整积木，在此编写Python代码..."
          spellCheck={false}
        />
      </div>
      <Space className="stage-actions">
        <Button
          className="stage-primary-action"
          type="primary"
          onClick={handleRun}
          loading={running}
          disabled={playbackActive}
          icon={<PlayCircleOutlined />}
        >
          运行代码
        </Button>
      </Space>

      {runResult && taskId === 1 && (
        <div className="terminal-output">
          <Text style={{ color: "#52c41a", fontSize: 12 }}>Python运行结果</Text>
          {runResult.stdout && <pre>{runResult.stdout}</pre>}
          {runResult.stderr && (
            <>
              <pre style={{ color: "#ffb4bd" }}>{getFriendlyFeedback(runResult).description}</pre>
              <details className="technical-details">
                <summary>查看技术详情</summary>
                <pre>{runResult.stderr}</pre>
              </details>
            </>
          )}
          {!runResult.stdout && !runResult.stderr && <pre style={{ color: "#94a3b8" }}>（无输出）</pre>}
        </div>
      )}

      <div ref={resultRef}>
        <ExecutionVisualizer
          type={visualizationType}
          result={runResult}
          input={programInput}
          visualization={taskContent?.visualization}
          onPlaybackComplete={deliverRunFeedback}
        />
      </div>
      <RuntimeProgramInput
        open={inputDialogOpen}
        prompt={taskContent?.c_stage?.input_placeholder}
        allowedValues={taskContent?.c_stage?.input_options}
        loading={running}
        onCancel={() => {
          setInputDialogOpen(false);
          inputLeaseRef.current?.release();
          inputLeaseRef.current = null;
        }}
        onSubmit={(value) => {
          const lease = inputLeaseRef.current;
          if (!lease || running) return;
          inputLeaseRef.current = null;
          setProgramInput(value);
          setInputDialogOpen(false);
          void runProgram(value, lease);
        }}
      />
    </>
  );
}
