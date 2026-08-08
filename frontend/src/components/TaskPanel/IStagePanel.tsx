import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Typography, Space, Button, Tag } from "antd";
import { useAppStore } from "../../store/useAppStore";
import { executeProgram } from "../../services/submitService";
import { trackAction } from "../../services/trackService";
import type { ExecutionResult, SupportRequest } from "../../types";
import { getFriendlyFeedback } from "../../utils/executionFeedback";
import ExecutionVisualizer from "../ExecutionVisualizer/ExecutionVisualizer";
import RuntimeProgramInput from "./RuntimeProgramInput";
import { executionAnchor } from "../../utils/agentAnchor";
import { TeamOutlined } from "@ant-design/icons";
import {
  artifactFingerprint,
  notifyRepeatedOperation,
  type OperationLease,
  useOperationGate,
} from "../../utils/operationGate";

const { Text, Paragraph } = Typography;

export default function IStagePanel() {
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<ExecutionResult | null>(null);
  const [runCount, setRunCount] = useState(0);
  const [programInput, setProgramInput] = useState("");
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const [codeRequired, setCodeRequired] = useState(false);
  const pythonCode = useAppStore((state) => state.iPythonCode);
  const setPythonCode = useAppStore((state) => state.setIPythonCode);
  const setPendingSystemMessage = useAppStore((state) => state.setPendingSystemMessage);
  const setAgentAnchor = useAppStore((state) => state.setAgentAnchor);
  const setLearningActivity = useAppStore((state) => state.setLearningActivity);
  const taskContent = useAppStore((state) => state.taskContent);
  const user = useAppStore((state) => state.user);
  const sessionId = useAppStore((state) => state.sessionId);
  const selectedTask = useAppStore((state) => state.selectedTask);
  const uiCopy = taskContent?.i_stage?.ui_copy;
  const visualizationType =
    taskContent?.i_stage?.visualization_override?.type || taskContent?.visualization?.type || "console";
  const resultRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const agentAnchor = useAppStore((state) => state.agentAnchor);
  const artifactRevision = useAppStore((state) => state.artifactRevision);
  const playbackActive = useAppStore((state) => state.learningActivity.playbackActive);
  const acquireOperation = useOperationGate();
  const inputLeaseRef = useRef<OperationLease | null>(null);
  const pendingRunFeedbackRef = useRef<{ artifactHash: string; message: SupportRequest } | null>(null);
  const deliverRunFeedback = useCallback(() => {
    const pending = pendingRunFeedbackRef.current;
    if (!pending) return;
    pendingRunFeedbackRef.current = null;
    const latest = useAppStore.getState();
    if (latest.currentStage !== "I" || artifactFingerprint(latest.iPythonCode) !== pending.artifactHash) return;
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
    if (!user || !selectedTask || !pythonCode.trim()) return;
    const timer = window.setTimeout(() => {
      const latest = useAppStore.getState();
      if (latest.currentStage !== "I" || latest.iPythonCode !== pythonCode) return;
      trackAction({
        user_id: user.id,
        session_id: sessionId,
        task_id: selectedTask.id,
        stage: "I",
        action_type: "i_code_snapshot",
        action_detail: { code: pythonCode, artifact_revision: latest.artifactRevision },
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [pythonCode, selectedTask, sessionId, user]);
  useEffect(() => {
    if (agentAnchor?.stage !== "I" || !agentAnchor.line || !codeRef.current) return;
    const lines = pythonCode.split(/\r?\n/);
    const start = lines.slice(0, agentAnchor.line - 1).reduce((total, line) => total + line.length + 1, 0);
    const end = start + (lines[agentAnchor.line - 1]?.length || 0);
    codeRef.current.focus();
    codeRef.current.setSelectionRange(start, end);
  }, [agentAnchor, pythonCode]);

  const handleStart = () => {
    if (!user || !selectedTask) return;
    if (started) {
      notifyRepeatedOperation("互动已经开始，请勿重复点击");
      return;
    }
    const lease = acquireOperation("i_start");
    if (!lease) return;
    setLearningActivity({ lastMeaningfulActionAt: Date.now() });
    setStarted(true);
    trackAction({
      user_id: user.id,
      session_id: sessionId,
      task_id: selectedTask.id,
      stage: "I",
      action_type: "i_collab_start",
    });
    setPendingSystemMessage({
      target_stage: "I",
      trigger: "collaboration_start",
      request_key: `${selectedTask.id}:I:collaboration_start:compressed-v2`,
    });
    lease.release();
  };

  const runProgram = async (inputValue: string, lease: OperationLease) => {
    if (!pythonCode.trim() || !selectedTask) {
      setCodeRequired(true);
      lease.release();
      return;
    }
    setCodeRequired(false);
    setLearningActivity({ running: true, lastMeaningfulActionAt: Date.now() });
    setRunning(true);
    const attempt = runCount + 1;
    const submittedCode = pythonCode;
    const artifactHash = artifactFingerprint(submittedCode);
    const submittedVersion = artifactRevision;
    pendingRunFeedbackRef.current = null;
    setRunCount(attempt);
    try {
      const result = await executeProgram({
        task_id: selectedTask.id,
        stage: "I",
        code: submittedCode,
        input: inputValue,
        attempt,
        operation_id: lease.operationId,
        artifact_hash: artifactHash,
        artifact_version: submittedVersion,
      });
      const latest = useAppStore.getState();
      if (latest.currentStage !== "I" || artifactFingerprint(latest.iPythonCode) !== artifactHash) return;
      setRunResult(result);
      setAgentAnchor(executionAnchor("I", result));
      if (result.status === "target_met" || result.agent_intervention_recommended) {
        const message: SupportRequest = {
          target_stage: "I",
          trigger: "run_feedback",
          attempt,
          run_outcome: result.status,
          error_line: result.line,
          student_code: submittedCode,
          artifact_version: result.artifact_version,
          diagnosis_code: result.learning_diagnostics?.find((item) => !item.resolved)?.code,
          diagnosis_occurrence: result.diagnosis_occurrence,
          evidence_ids: result.learning_diagnostics?.flatMap((item) => item.evidence_ids),
        };
        if (
          visualizationType === "variable_map" &&
          result.started &&
          result.events.some((event) => event.type === "stage")
        ) {
          pendingRunFeedbackRef.current = { artifactHash, message };
        } else {
          setPendingSystemMessage(message);
        }
      }
    } catch {
      setRunResult({
        status: "runtime_error",
        started: false,
        code: pythonCode,
        line_block_map: {},
        diagnostics: [],
        stdout: "",
        stderr: "运行服务暂时无法连接",
        line: null,
        events: [],
        expected_output: "",
      });
    } finally {
      setRunning(false);
      lease.release();
    }
  };

  const handleRun = () => {
    if (!pythonCode.trim()) {
      setCodeRequired(true);
      return;
    }
    if (playbackActive) {
      notifyRepeatedOperation("程序正在展示结果，请勿重复运行");
      return;
    }
    const lease = acquireOperation("i_run");
    if (!lease) return;
    if (taskContent?.i_stage?.requires_input) {
      inputLeaseRef.current = lease;
      setLearningActivity({ inputOpen: true, lastMeaningfulActionAt: Date.now() });
      setInputDialogOpen(true);
      return;
    }
    void runProgram("", lease);
  };

  return (
    <>
      <div className="stage-card partner collaboration-card stage-task-window">
        <div className="challenge-heading">
          <span className="challenge-symbol" aria-hidden="true"><TeamOutlined /></span>
          <Text strong className="stage-section-title">任务互动</Text>
        </div>
        <Paragraph className="partner-description stage-section-description">
          {started
            ? uiCopy?.planning || "学习伙伴已经了解本阶段目标。先说明思路，再编写和运行代码，最后结合真实结果讨论。"
            : uiCopy?.planning || "先和右侧学习伙伴一起规划思路。它会根据本阶段真实任务信息提问，但不会替你写出答案。"}
        </Paragraph>
        {!started && (
          <Button className="stage-primary-action" type="primary" onClick={handleStart}>
            和学习助手讨论思路
          </Button>
        )}
        <div className="interaction-guide">
        <Text strong>{taskContent?.i_stage?.title || "固定拓展任务"}</Text>
        <Paragraph>{taskContent?.i_stage?.description}</Paragraph>
        <div className="guide-step"><Tag color="blue">1</Tag>{uiCopy?.reference_step || "观察左侧C阶段完整积木，先说清楚你的解题计划"}</div>
        <div className="guide-step"><Tag color="cyan">2</Tag>在下方编辑器中从空白开始写Python代码</div>
        <div className="guide-step"><Tag color="purple">3</Tag>{uiCopy?.discussion_step || "运行后根据真实结果和错误继续交流"}</div>
        </div>
      </div>

      <div className="code-shell">
        <div className="code-shell-title">
          <span className="code-status-dot" />
          {agentAnchor?.stage === "I" && agentAnchor.label && (
            <Tag className="agent-anchor-label">{agentAnchor.label}</Tag>
          )}
          Python代码探索区
        </div>
        <textarea
          ref={codeRef}
          value={pythonCode}
          onChange={(event) => {
            setPythonCode(event.target.value);
            if (event.target.value.trim()) setCodeRequired(false);
          }}
          className="code-textarea"
          placeholder={uiCopy?.editor_placeholder || "# 根据你的解题计划，从空白开始编写代码..."}
          spellCheck={false}
        />
      </div>
      {codeRequired && (
        <Alert
          type="warning"
          showIcon
          title="代码编辑区还是空的"
          description={uiCopy?.empty_code_description || "先写下程序，再点击运行代码。"}
        />
      )}
      <Space className="stage-actions">
        <Button className="stage-primary-action" type="primary" onClick={handleRun} loading={running} disabled={playbackActive}>
          运行代码
        </Button>
      </Space>

      {runResult && selectedTask?.id === 1 && (
        <div className="terminal-output">
          <Text style={{ color: "#52c41a", fontSize: 12 }}>运行结果</Text>
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
          {!runResult.stdout && !runResult.stderr && <pre style={{ color: "#94a3b8" }}>（没有文本输出）</pre>}
        </div>
      )}
      <div ref={resultRef}>
        <ExecutionVisualizer
          type={taskContent?.i_stage?.visualization_override?.type || taskContent?.visualization?.type || "console"}
          result={runResult}
          input={programInput}
          allowMismatch
          visualization={taskContent?.i_stage?.visualization_override || taskContent?.visualization}
          onPlaybackComplete={deliverRunFeedback}
        />
      </div>
      <RuntimeProgramInput
        open={inputDialogOpen}
        prompt={taskContent?.i_stage?.input_placeholder}
        allowedValues={taskContent?.i_stage?.input_options}
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
