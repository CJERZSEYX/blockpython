import { useState, useRef, useEffect, useCallback } from "react";
import { Input, Button, Space, Typography } from "antd";
import { SendOutlined, RobotOutlined, UserOutlined } from "@ant-design/icons";
import type { Stage } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { sendChatMessage } from "../../services/chatService";
import { trackAction } from "../../services/trackService";

const { Text } = Typography;

function renderChatContent(text: string): string {
  let html = text;
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong style='color:#4361ee'>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<strong>$1</strong>");
  html = html.replace(/【(.+?)】/g, "<strong style='color:#4361ee'>【$1】</strong>");
  html = html.replace(/\n/g, "<br/>");
  html = html.replace(/^-\s(.+)$/gm, "\u00b7 $1");
  return html;
}

const roleLabels: Record<Stage, string> = { P: "Instructor", A: "Coach", C: "Guide", I: "Partner" };
const roleAvatars: Record<Stage, string> = { P: "📖", A: "🎯", C: "🧭", I: "🤝" };

const welcomeMessages: Record<Stage, string> = {
  P: "Hello! I'm your programming instructor. Click the [Task Breakdown] button below and I'll help break the task into sub-steps. Feel free to ask me anything!",
  A: "Now entering the practice phase. Look at the Python code in the task area and drag the corresponding blocks in the block editor. Don't worry, I'll do my best to help!",
  C: "New challenge! The left side shows block diagrams — write the corresponding Python code. I can give you hints, but I won't give you the code directly. You've got this!",
  I: "Hey! Let's review what we learned today. I'll summarize, then I'll quiz you — and you can quiz me too!",
};

interface ChatWindowProps { stage: Stage; userId: string; sessionId: string; }

export default function ChatWindow({ stage, userId, sessionId }: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [welcomeShown, setWelcomeShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessages = useAppStore((s) => s.chatMessages);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const pendingSystemMessage = useAppStore((s) => s.pendingSystemMessage);
  const setPendingSystemMessage = useAppStore((s) => s.setPendingSystemMessage);
  const selectedTask = useAppStore((s) => s.selectedTask);

  const callLLM = useCallback(async (text: string, isSystem: boolean) => {
    setSending(true);
    try {
      const recent = chatMessages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const response = await sendChatMessage([...recent, { role: "user" as const, content: text }], stage);
      const reply = response?.choices?.[0]?.message?.content || "Sorry, I'm unable to reply right now.";
      addChatMessage({ role: "assistant", content: reply });
      trackAction({ user_id: userId, session_id: sessionId, task_id: selectedTask?.id, stage, action_type: isSystem ? "llm_system_trigger" : "chat_receive", action_detail: { message: reply } });
    } catch {
      addChatMessage({ role: "assistant", content: "Connection failed. Please check your network and try again." });
    } finally { setSending(false); }
  }, [stage, userId, sessionId, addChatMessage]);

  useEffect(() => { if (pendingSystemMessage) { callLLM(pendingSystemMessage, true); setPendingSystemMessage(null); } }, [pendingSystemMessage]);
  useEffect(() => { if (!welcomeShown) { addChatMessage({ role: "assistant", content: welcomeMessages[stage] }); setWelcomeShown(true); } }, [stage]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;
    setInputValue("");
    addChatMessage({ role: "user", content: text });
    trackAction({ user_id: userId, session_id: sessionId, task_id: selectedTask?.id, stage, action_type: "chat_send", action_detail: { message: text } });
    await callLLM(text, false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
            {/* Avatar */}
            <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: msg.role === "user" ? "linear-gradient(135deg, #636e72, #b2bec3)" : "linear-gradient(135deg, #4361ee, #7209b7)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {msg.role === "user" ? <UserOutlined style={{ color: "#fff", fontSize: 14 }} /> : <span>{roleAvatars[stage]}</span>}
            </div>
            <div>
              <div style={{
                padding: "10px 14px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: msg.role === "user" ? "#e9ecef" : "#eef0ff",
                color: "#2d3436", fontSize: 14, lineHeight: 1.7, wordBreak: "break-word",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }} dangerouslySetInnerHTML={{ __html: msg.role === "assistant" ? renderChatContent(msg.content) : msg.content }} />
              <Text type="secondary" style={{ fontSize: 10, display: "block", marginTop: 2, paddingLeft: msg.role === "user" ? 0 : 4, textAlign: msg.role === "user" ? "right" : "left" }}>
                {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: "10px 14px", borderTop: "1px solid #e9ecef", background: "#fafbfc" }}>
        <Space.Compact style={{ width: "100%" }}>
          <div style={{ flex: 1,
            border: `2px solid ${focused ? "#4361ee" : "#e9ecef"}`,
            borderRadius: 10, transition: "border-color 0.2s", overflow: "hidden" }}>
            <Input.TextArea value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type a question... (Shift+Enter for new line)" disabled={sending}
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ border: "none", boxShadow: "none", background: "transparent", padding: "8px 12px" }} />
          </div>
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sending}
            style={{ height: "auto", borderRadius: "0 10px 10px 0", background: "#4361ee", border: "none",
              boxShadow: "0 2px 6px rgba(67,97,238,0.3)" }} />
        </Space.Compact>
      </div>
    </div>
  );
}
