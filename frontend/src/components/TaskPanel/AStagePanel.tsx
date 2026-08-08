import { useCallback, useEffect, useRef, useState } from "react";
import { Typography, Space, Button } from "antd";
import { CheckCircleFilled, PlayCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import type { ExecutionResult, SupportRequest, TaskContent } from "../../types";
import type { BlocklyEditorHandle } from "../BlocklyEditor/BlocklyEditor";
import { useAppStore } from "../../store/useAppStore";
import { executeProgram } from "../../services/submitService";
import ExecutionVisualizer from "../ExecutionVisualizer/ExecutionVisualizer";
import LearningGuide from "./LearningGuide";
import { trackAction } from "../../services/trackService";
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

interface AStagePanelProps {
  taskContent: TaskContent | null;
  blocklyRef: React.RefObject<BlocklyEditorHandle | null>;
  taskId: number;
}

export default function AStagePanel({ taskContent, blocklyRef, taskId }: AStagePanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [programInput, setProgramInput] = useState("");
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const setPendingSystemMessage = useAppStore((state) => state.setPendingSystemMessage);
  const setAgentAnchor = useAppStore((state) => state.setAgentAnchor);
  const setLearningActivity = useAppStore((state) => state.setLearningActivity);
  const user = useAppStore((state) => state.user);
  const sessionId = useAppStore((state) => state.sessionId);
  const chatMessages = useAppStore((state) => state.chatMessages);
  const currentBlocklyXml = useAppStore((state) => state.currentBlocklyXml);
  const playbackActive = useAppStore((state) => state.learningActivity.playbackActive);
  const acquireOperation = useOperationGate();
  const inputLeaseRef = useRef<OperationLease | null>(null);
  const learningState = useAppStore((state) => state.learningState);
  const applyLearningState = useAppStore((state) => state.applyLearningState);
  const referenceHidden = Boolean(learningState?.a_reference_hidden);
  const pendingRunFeedbackRef = useRef<{ artifactHash: string; message: SupportRequest } | null>(null);

  const deliverRunFeedback = useCallback(() => {
    const pending = pendingRunFeedbackRef.current;
    if (!pending) return;
    pendingRunFeedbackRef.current = null;
    const latest = useAppStore.getState();
    const currentXml = blocklyRef.current?.getXml() || "";
    if (latest.currentStage !== "A" || artifactFingerprint(currentXml) !== pending.artifactHash) return;
    setPendingSystemMessage(pending.message);
  }, [blocklyRef, setPendingSystemMessage]);

  const pythonCode = taskContent?.a_stage?.python_code || "";
  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);
  useEffect(() => {
    setLearningActivity({ running: submitting, inputOpen: inputDialogOpen });
    return () => setLearningActivity({ running: false, inputOpen: false });
  }, [inputDialogOpen, setLearningActivity, submitting]);

  const runProgram = async (inputValue: string, lease: OperationLease) => {
    const blocklyXml = blocklyRef.current?.getXml() || "";
    const artifactHash = artifactFingerprint(blocklyXml);
    const artifactVersion = useAppStore.getState().artifactRevision;
    const nextAttempt = attempts + 1;
    pendingRunFeedbackRef.current = null;
    setLearningActivity({ running: true, lastMeaningfulActionAt: Date.now() });
    setSubmitting(true);
    setAttempts(nextAttempt);
    try {
      const response = await executeProgram({
        task_id: taskId,
        stage: "A",
        blockly_xml: blocklyXml,
        input: inputValue,
        attempt: nextAttempt,
        activity_summary: blocklyRef.current?.getActivitySummary(),
        operation_id: lease.operationId,
        artifact_hash: artifactHash,
        artifact_version: artifactVersion,
      });
      const latest = useAppStore.getState();
      const currentXml = blocklyRef.current?.getXml() || "";
      if (latest.currentStage !== "A" || artifactFingerprint(currentXml) !== artifactHash) return;
      setResult(response);
      if (response.learning_state) applyLearningState(response.learning_state);
      const problemBlock = response.diagnostics.find((item) => item.block_id)?.block_id || null;
      blocklyRef.current?.highlightBlock(problemBlock);
      setAgentAnchor(executionAnchor("A", response));
      if (response.status === "target_met" || response.agent_intervention_recommended) {
        const message: SupportRequest = {
          target_stage: "A",
          trigger: "run_feedback",
          attempt: nextAttempt,
          run_outcome: response.status,
          error_line: response.line,
          block_id: problemBlock || undefined,
          student_code: response.generated_code,
          artifact_version: response.artifact_version,
          diagnosis_code: response.learning_diagnostics?.find((item) => !item.resolved)?.code,
          diagnosis_occurrence: response.diagnosis_occurrence,
          evidence_ids: response.learning_diagnostics?.flatMap((item) => item.evidence_ids),
        };
        if (
          taskContent?.visualization?.type === "variable_map" &&
          response.started &&
          response.events.some((event) => event.type === "stage")
        ) {
          pendingRunFeedbackRef.current = { artifactHash, message };
        } else {
          setPendingSystemMessage(message);
        }
      }
    } catch {
      // The result area remains the source of truth when the execution service is unavailable.
    } finally {
      setSubmitting(false);
      lease.release();
    }
  };

  const handleSubmit = () => {
    if (playbackActive) {
      notifyRepeatedOperation("程序正在展示结果，请勿重复运行");
      return;
    }
    const lease = acquireOperation("a_run");
    if (!lease) return;
    if (learningState?.a_completed) {
      trackAction({
        user_id: user?.id || "",
        session_id: sessionId,
        task_id: taskId,
        stage: "A",
        action_type: "a_completed_action",
        action_detail: { source: "run" },
      });
      setPendingSystemMessage({
        target_stage: "A",
        trigger: "stage_completed",
        request_key: `${taskId}:A:stage_completed:v2`,
      });
      lease.release();
      return;
    }
    if (taskContent?.a_stage?.requires_input) {
      inputLeaseRef.current = lease;
      setLearningActivity({ inputOpen: true, lastMeaningfulActionAt: Date.now() });
      setInputDialogOpen(true);
      return;
    }
    void runProgram("", lease);
  };

  const handleAskForHint = () => {
    if (!user) return;
    const lease = acquireOperation("a_hint");
    if (!lease) return;
    if (learningState?.a_completed) {
      trackAction({
        user_id: user.id,
        session_id: sessionId,
        task_id: taskId,
        stage: "A",
        action_type: "a_completed_action",
        action_detail: { source: "hint" },
      });
      setPendingSystemMessage({
        target_stage: "A",
        trigger: "stage_completed",
        request_key: `${taskId}:A:stage_completed:v2`,
      });
      lease.release();
      return;
    }
    const blocklyXml = blocklyRef.current?.getXml() || "";
    const hintArtifact = `A:${artifactFingerprint(currentBlocklyXml)}`;
    if (chatMessages.some((message) => message.role === "assistant" && message.artifact_token === hintArtifact)) {
      recordSuppressedOperation("a_hint_same_artifact", "当前作品已有提示，请先修改后再请求");
      lease.release();
      return;
    }
    trackAction({
      user_id: user.id,
      session_id: sessionId,
      task_id: taskId,
      stage: "A",
      action_type: "a_hint_request",
      action_detail: {
        attempts_so_far: attempts,
        has_blocks: blocklyXml.includes("<block"),
      },
    });
    setPendingSystemMessage({
      target_stage: "A",
      trigger: "hint_request",
      attempt: attempts,
      request_key: `${taskId}:A:hint_request:${artifactFingerprint(currentBlocklyXml)}`,
    });
    lease.release();
  };

  return (
    <div className="challenge-shell">
      <div className="stage-card practice stage-task-window">
        <div className="challenge-heading">
          <span className="challenge-symbol" aria-hidden="true"><PlayCircleOutlined /></span>
          <Text strong className="stage-section-title">根据以下代码搭建积木</Text>
        </div>
        {taskContent?.a_stage?.instruction && (
          <Paragraph className="challenge-description stage-section-description">
            {taskContent.a_stage.instruction}
          </Paragraph>
        )}
        <LearningGuide guide={taskContent?.learning_guide} stage="A" />
        {referenceHidden ? (
          <div className="stage-completed-panel">
            <CheckCircleFilled />
            <div>
              <Text strong>本阶段已完成</Text>
              <Paragraph>目标Python代码已隐藏。你完成时搭建的积木仍保留在左侧，可用于回顾积木结构。</Paragraph>
            </div>
          </div>
        ) : (
          <div className="code-block code-block-numbered" aria-label="目标Python程序">
            {pythonCode.split("\n").map((line, index) => (
              <div className="code-preview-line" key={`${index}-${line}`}>
                <span>{index + 1}</span>
                <code>{line || " "}</code>
              </div>
            ))}
          </div>
        )}
        <Space className="stage-actions">
          <Button
            className="stage-primary-action"
            type="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={playbackActive}
            icon={<PlayCircleOutlined />}
          >
            生成并运行
          </Button>
          <Button
            className="hint-action-button"
            icon={<QuestionCircleOutlined />}
            onClick={handleAskForHint}
            disabled={submitting}
          >
            请求搭建提示
          </Button>
        </Space>
      </div>

      <div ref={resultRef}>
        <ExecutionVisualizer
          type={taskContent?.visualization?.type || "console"}
          result={result}
          input={programInput}
          visualization={taskContent?.visualization}
          onPlaybackComplete={deliverRunFeedback}
        />
        {result?.generated_code && (
          <details className="generated-code-details">
            <summary>查看积木生成的Python</summary>
            <pre>{result.generated_code}</pre>
          </details>
        )}
      </div>
      <RuntimeProgramInput
        open={inputDialogOpen}
        prompt={taskContent?.a_stage?.input_placeholder}
        allowedValues={taskContent?.a_stage?.input_options}
        loading={submitting}
        onCancel={() => {
          setInputDialogOpen(false);
          inputLeaseRef.current?.release();
          inputLeaseRef.current = null;
        }}
        onSubmit={(value) => {
          const lease = inputLeaseRef.current;
          if (!lease || submitting) return;
          inputLeaseRef.current = null;
          setProgramInput(value);
          setInputDialogOpen(false);
          void runProgram(value, lease);
        }}
      />
    </div>
  );
}
