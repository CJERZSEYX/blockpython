import { useState, useRef, useEffect, useCallback } from "react";
import { Input, Button, Space, Typography } from "antd";
import { ReloadOutlined, SendOutlined, UserOutlined } from "@ant-design/icons";
import type { Stage, SupportRequest } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { getChatHistory, sendChatMessage } from "../../services/chatService";
import { trackAction } from "../../services/trackService";
import { notifyRepeatedOperation, useOperationGate } from "../../utils/operationGate";
import { inactivityThresholdForStage } from "../../utils/agentSupport";

const { Text } = Typography;

function renderChatContent(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong style='color:#4361ee'>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<strong>$1</strong>");
  html = html.replace(/【(.+?)】/g, "<strong style='color:#4361ee'>【$1】</strong>");
  html = html.replace(/\n/g, "<br/>");
  html = html.replace(/^-\s(.+)$/gm, "\u00b7 $1");
  return html;
}

interface ChatWindowProps { stage: Stage; userId: string; sessionId: string; }

function artifactContent(stage: Stage, state: ReturnType<typeof useAppStore.getState>): string {
  if (stage === "A") return state.currentBlocklyXml;
  if (stage === "C") return state.pythonCode;
  if (stage === "I") return state.iPythonCode;
  return "";
}

function artifactToken(stage: Stage, content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${stage}:${(hash >>> 0).toString(16)}:${normalized.length}`;
}

function requestArtifactToken(stage: Stage, trigger: string, state: ReturnType<typeof useAppStore.getState>) {
  if (trigger === "stage_intro" || trigger === "p_step_explanation" || trigger === "collaboration_start") {
    return `${stage}:context`;
  }
  return artifactToken(stage, artifactContent(stage, state));
}

export default function ChatWindow({ stage, userId, sessionId }: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failedRequest, setFailedRequest] = useState<{
    text: string;
    id: string;
    retryWithNewId?: boolean;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const anchorTimerRef = useRef<number | null>(null);
  const inactivityKeyRef = useRef<string | null>(null);
  const lastHintRequestRef = useRef<string | null>(null);
  const activeRequestKeysRef = useRef(new Set<string>());
  const completedSystemRequestKeysRef = useRef(new Set<string>());
  const requestSequenceRef = useRef(0);
  const latestPriorityRequestRef = useRef(0);
  const activeRequestCountRef = useRef(0);
  const chatMessages = useAppStore((s) => s.chatMessages);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const mergeChatHistory = useAppStore((s) => s.mergeChatHistory);
  const pendingSystemMessage = useAppStore((s) => s.pendingSystemMessage);
  const setPendingSystemMessage = useAppStore((s) => s.setPendingSystemMessage);
  const selectedTask = useAppStore((s) => s.selectedTask);
  const currentBlocklyXml = useAppStore((s) => s.currentBlocklyXml);
  const pythonCode = useAppStore((s) => s.pythonCode);
  const iPythonCode = useAppStore((s) => s.iPythonCode);
  const learningActivity = useAppStore((s) => s.learningActivity);
  const setLearningActivity = useAppStore((s) => s.setLearningActivity);
  const setAgentAnchor = useAppStore((s) => s.setAgentAnchor);
  const learningState = useAppStore((s) => s.learningState);
  const acquireOperation = useOperationGate();

  useEffect(() => {
    setLearningActivity({ chatFocused: focused, chatSending: sending });
    return () => setLearningActivity({ chatFocused: false, chatSending: false });
  }, [focused, sending, setLearningActivity]);

  const callLLM = useCallback(async (
    text: string,
    supportRequest?: SupportRequest,
    clientMessageId?: string,
  ) => {
    const isSystem = Boolean(supportRequest);
    const requestTaskId = selectedTask!.id;
    const requestState = useAppStore.getState();
    const trigger = supportRequest?.trigger || "student_message";
    const requestRevision = requestState.artifactRevision;
    const requestToken = requestArtifactToken(stage, trigger, requestState);
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const requestStartedAt = Date.now();
    const isStageIntro = trigger === "stage_intro";
    if (!isStageIntro) latestPriorityRequestRef.current = requestSequence;
    if (trigger === "hint_request") {
      const hintKey = `${requestTaskId}:${stage}:${requestToken}`;
      if (lastHintRequestRef.current === hintKey) {
        notifyRepeatedOperation("当前作品已有提示，请先修改后再请求");
        return true;
      }
      lastHintRequestRef.current = hintKey;
    }
    const requestKey = isSystem
      ? supportRequest?.request_key
        || `${requestTaskId}:${stage}:${trigger}:${requestToken}:${supportRequest?.diagnosis_code || "none"}:${supportRequest?.diagnosis_occurrence || 0}`
      : clientMessageId || crypto.randomUUID();
    if (isSystem && completedSystemRequestKeysRef.current.has(requestKey)) {
      notifyRepeatedOperation("这条系统提示已经发送，请勿重复操作");
      return true;
    }
    if (activeRequestKeysRef.current.has(requestKey)) {
      notifyRepeatedOperation();
      return true;
    }
    activeRequestKeysRef.current.add(requestKey);
    activeRequestCountRef.current += 1;
    setSending(true);
    try {
      const recent = chatMessages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const outgoingMessages = isSystem
        ? recent
        : [...recent, { role: "user" as const, content: text }];
      const response = await sendChatMessage(
        outgoingMessages,
        stage,
        {
          task_id: requestTaskId,
          ...supportRequest,
          trigger,
          student_code: stage === "C"
            ? requestState.pythonCode
            : stage === "I"
              ? requestState.iPythonCode
              : supportRequest?.student_code,
          blockly_xml: stage === "A"
            ? requestState.currentBlocklyXml
            : requestState.cStageBlocksXml || undefined,
          message_type: isSystem ? "system_trigger" : "dialogue",
          client_message_id: clientMessageId,
          artifact_version: requestRevision,
          artifact_token: requestToken,
          support_level: supportRequest?.support_level,
          diagnosis_code: supportRequest?.diagnosis_code,
          diagnosis_occurrence: supportRequest?.diagnosis_occurrence,
          evidence_ids: supportRequest?.evidence_ids,
          step_id: supportRequest?.step_id,
          request_key: isSystem ? requestKey : undefined,
        }
      );
      if (response?.skipped) return true;
      const latestState = useAppStore.getState();
      if (latestState.currentStage !== stage || latestState.selectedTask?.id !== requestTaskId) return true;
      const stageIntroIsStale = isStageIntro && (
        latestPriorityRequestRef.current > requestSequence
        || latestState.artifactRevision !== requestRevision
        || latestState.learningActivity.lastMeaningfulActionAt > requestStartedAt
        || latestState.learningActivity.running
        || latestState.learningActivity.inputOpen
        || latestState.learningActivity.playbackActive
      );
      if (stageIntroIsStale) {
        trackAction({
          user_id: userId,
          session_id: sessionId,
          task_id: requestTaskId,
          stage,
          action_type: "agent_response_stale",
          action_detail: {
            reason: "stage_intro_superseded",
            trigger,
            request_key: requestKey,
            request_sequence: requestSequence,
            latest_priority_request: latestPriorityRequestRef.current,
            request_revision: requestRevision,
            current_revision: latestState.artifactRevision,
            intervention_id: response?.intervention?.intervention_id,
          },
        });
        return true;
      }
      const currentToken = requestArtifactToken(stage, trigger, latestState);
      if (currentToken !== requestToken || (response?.artifact_token && response.artifact_token !== requestToken)) {
        if (!isSystem && clientMessageId) {
          setFailedRequest({ text, id: clientMessageId, retryWithNewId: true });
          setInputValue(text);
          addChatMessage({
            role: "assistant",
            content: "你发送问题后修改了当前内容。为了避免按旧内容回答，这次回复已取消；问题已经放回输入框，请确认后重新发送。",
            artifact_token: currentToken,
          });
        }
        trackAction({
          user_id: userId,
          session_id: sessionId,
          task_id: requestTaskId,
          stage,
          action_type: "agent_response_stale",
          action_detail: {
            request_key: requestKey,
            request_revision: requestRevision,
            current_revision: latestState.artifactRevision,
            request_artifact_token: requestToken,
            current_artifact_token: currentToken,
            intervention_id: response?.intervention?.intervention_id,
          },
        });
        return true;
      }
      const reply = response?.choices?.[0]?.message?.content || "抱歉，我暂时无法回复。";
      addChatMessage({ role: "assistant", content: reply, artifact_token: requestToken });
      if (isSystem) completedSystemRequestKeysRef.current.add(requestKey);
      if (response?.intervention?.block_id || response?.intervention?.line) {
        setAgentAnchor({
          stage,
          block_id: response.intervention.block_id,
          line: response.intervention.line,
          label: response.intervention.anchor_label,
        });
        if (anchorTimerRef.current) window.clearTimeout(anchorTimerRef.current);
        anchorTimerRef.current = window.setTimeout(() => setAgentAnchor(null), 12000);
      }
      if (!isSystem) setFailedRequest(null);
      trackAction({ user_id: userId, session_id: sessionId, task_id: requestTaskId, stage, action_type: isSystem ? "llm_system_trigger" : "chat_receive", action_detail: { message: reply } });
      return true;
    } catch {
      const latestState = useAppStore.getState();
      if (latestState.currentStage === stage && latestState.selectedTask?.id === requestTaskId) {
        if (!isSystem && clientMessageId) setFailedRequest({ text, id: clientMessageId });
        addChatMessage({
          role: "assistant",
          content: isSystem
            ? "学习伙伴暂时没有连接成功，你可以继续当前操作，稍后再请求提示。"
            : "这条消息仍保留在当前页面，但学习伙伴暂时没有回复。点击输入框上方的“重新发送”即可重试。",
        });
      }
      return false;
    } finally {
      activeRequestKeysRef.current.delete(requestKey);
      activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
      setSending(activeRequestCountRef.current > 0);
    }
  }, [
    stage,
    userId,
    sessionId,
    addChatMessage,
    chatMessages,
    selectedTask,
    setAgentAnchor,
  ]);

  useEffect(() => {
    if (!pendingSystemMessage) return;
    if (pendingSystemMessage.target_stage && pendingSystemMessage.target_stage !== stage) return;
    const message = pendingSystemMessage;
    const timer = window.setTimeout(() => {
      setPendingSystemMessage(null);
      void callLLM("", message);
    }, message.trigger === "stage_intro" ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [callLLM, pendingSystemMessage, setPendingSystemMessage, stage]);
  useEffect(() => {
    if (stage === "P") return;
    if (stage === "A" && learningState?.a_completed) return;
    const content = stage === "A" ? currentBlocklyXml : stage === "C" ? pythonCode : iPythonCode;
    const nonempty = stage === "A" ? content.includes("<block") : Boolean(content.trim());
    const threshold = inactivityThresholdForStage(stage);
    if (threshold === null) return;
    if (!nonempty || pendingSystemMessage || sending) return;
    if (
      learningActivity.running
      || learningActivity.inputOpen
      || learningActivity.playbackActive
      || learningActivity.chatFocused
      || learningActivity.chatSending
    ) return;
    const token = artifactToken(stage, content);
    const timer = window.setTimeout(() => {
      const latest = useAppStore.getState();
      const currentContent = artifactContent(stage, latest);
      const currentToken = artifactToken(stage, currentContent);
      const activity = latest.learningActivity;
      if (
        document.hidden
        || latest.currentStage !== stage
        || currentToken !== token
        || latest.pendingSystemMessage
        || activity.running
        || activity.inputOpen
        || activity.playbackActive
        || activity.chatFocused
        || activity.chatSending
        || inactivityKeyRef.current === token
      ) return;
      inactivityKeyRef.current = token;
      latest.setPendingSystemMessage({ target_stage: stage, trigger: "inactivity" });
    }, Math.max(250, threshold - (Date.now() - learningActivity.lastMeaningfulActionAt)));
    return () => window.clearTimeout(timer);
  }, [
    currentBlocklyXml,
    iPythonCode,
    learningActivity,
    learningState?.a_completed,
    pendingSystemMessage,
    pythonCode,
    sending,
    stage,
  ]);
  useEffect(() => () => {
    if (anchorTimerRef.current) window.clearTimeout(anchorTimerRef.current);
  }, []);
  useEffect(() => {
    if (!selectedTask || chatMessages.length > 0) return;
    let active = true;
    const historyToken = requestArtifactToken(stage, "student_message", useAppStore.getState());
    getChatHistory(selectedTask.id, stage, historyToken)
      .then((history) => {
        if (!active) return;
        if (history.length > 0) {
          mergeChatHistory(history.map((message) => ({
            role: message.role,
            content: message.content,
            message_type: message.message_type,
            artifact_token: message.artifact_token,
            timestamp: new Date(message.created_at).getTime(),
          })));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [stage, selectedTask, chatMessages.length, mergeChatHistory]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) return;
    if (sending) {
      notifyRepeatedOperation();
      return;
    }
    const lease = acquireOperation("chat_send");
    if (!lease) return;
    const clientMessageId = crypto.randomUUID();
    setInputValue("");
    addChatMessage({ role: "user", content: text });
    trackAction({
      user_id: userId,
      session_id: sessionId,
      task_id: selectedTask?.id,
      stage,
      action_type: "chat_send",
      action_detail: { message: text, client_message_id: clientMessageId },
    });
    try {
      await callLLM(text, undefined, clientMessageId);
    } finally {
      lease.release();
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {chatMessages.map((msg, i) => (
          <div key={i} className={`chat-row ${msg.role}`}>
            <div className="chat-avatar">
              {msg.role === "user" ? <UserOutlined style={{ color: "#fff", fontSize: 14 }} /> : <span aria-hidden="true">学</span>}
            </div>
            <div className="chat-message-content">
              {msg.role === "assistant" ? (
                <div
                  className="chat-bubble"
                  dangerouslySetInnerHTML={{ __html: renderChatContent(msg.content) }}
                />
              ) : (
                <div className="chat-bubble">{msg.content}</div>
              )}
              <Text className="chat-time">
                {new Date(msg.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-composer">
        {failedRequest && (
          <Button
            className="chat-retry"
            type="link"
            size="small"
            icon={<ReloadOutlined />}
            disabled={sending}
            onClick={() => void callLLM(
              failedRequest.text,
              undefined,
              failedRequest.retryWithNewId ? crypto.randomUUID() : failedRequest.id,
            )}
          >
            重新发送上一条消息
          </Button>
        )}
        <Space.Compact className={`chat-composer-control ${focused ? "is-focused" : ""}`}>
          <div className="chat-input-shell">
            <Input.TextArea value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入问题... (Shift+Enter换行)" disabled={sending}
              autoSize={{ minRows: 1, maxRows: 4 }}
              className="chat-input" />
          </div>
          <Button className="chat-send" type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sending}
            aria-label="发送" />
        </Space.Compact>
      </div>
    </div>
  );
}
