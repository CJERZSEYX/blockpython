import { Layout, Button, Typography } from "antd";
import { ArrowLeftOutlined, CodeOutlined } from "@ant-design/icons";
import BlocklyEditor from "../BlocklyEditor/BlocklyEditor";
import type { BlocklyEditorHandle } from "../BlocklyEditor/BlocklyEditor";
import type { Task, Stage, TaskContent } from "../../types";
import TaskPanel from "../TaskPanel/TaskPanel";
import ChatWindow from "../ChatWindow/ChatWindow";
import StageButtons from "../StageController/StageButtons";

const { Header, Content } = Layout;
const { Text } = Typography;

interface TeachingLayoutProps {
  blocklyRef: React.RefObject<BlocklyEditorHandle | null>;
  selectedTask: Task;
  currentStage: Stage;
  roleLabel: string;
  userId: string;
  sessionId: string;
  taskContent: TaskContent | null;
  onStageChange: (stage: Stage) => void;
  onBack: () => void;
}

export default function TeachingLayout({
  blocklyRef, selectedTask, currentStage, roleLabel,
  userId, sessionId, taskContent, onStageChange, onBack,
}: TeachingLayoutProps) {
  return (
    <Layout style={{ height: "100vh", background: "#f8f9fa" }}>
      <Header style={{
        background: "linear-gradient(135deg, #3a0ca3, #4361ee)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 52, lineHeight: "52px",
        boxShadow: "0 2px 12px rgba(67,97,238,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CodeOutlined style={{ color: "#a2d2ff", fontSize: 18 }} />
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ color: "#bde0fe" }}>Back</Button>
          <Text strong style={{ color: "#e0e1ff", fontSize: 15 }}>{selectedTask.title}</Text>
        </div>
        <Text style={{ color: "#a2d2ff", fontSize: 12 }}>Current: {roleLabel}</Text>
      </Header>

      <Content style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Block Editor */}
        <div style={{
          width: 380, flexShrink: 0, display: "flex", flexDirection: "column",
          background: "#fff", borderRight: "1px solid #e9ecef",
          boxShadow: "2px 0 8px rgba(0,0,0,0.03)",
        }}>
          <div style={{ padding: "10px 14px", background: "#f8f9ff", borderBottom: "1px solid #e9ecef", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text strong style={{ fontSize: 13, color: "#4361ee" }}>🧩 Block Editor</Text>
            <Button size="small" type="text" onClick={() => blocklyRef.current?.clearWorkspace()} style={{ fontSize: 12, color: "#636e72" }}>Reset</Button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <BlocklyEditor ref={blocklyRef} />
          </div>
        </div>

        {/* Task Area */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          background: "#fff", borderRight: "1px solid #e9ecef", minWidth: 0,
        }}>
          <div style={{ padding: "8px 14px", background: "#f8f9ff", borderBottom: "1px solid #e9ecef" }}>
            <Text strong style={{ fontSize: 13, color: "#4361ee" }}>📋 Task Area</Text>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
            <TaskPanel stage={currentStage} taskId={selectedTask.id} taskContent={taskContent} blocklyRef={blocklyRef} />
          </div>
          <div style={{ padding: "10px 16px", background: "#f8f9ff", borderTop: "1px solid #e9ecef" }}>
            <StageButtons currentStage={currentStage} onStageChange={onStageChange} />
          </div>
        </div>

        {/* Chat */}
        <div style={{
          width: 320, flexShrink: 0, display: "flex", flexDirection: "column",
          background: "#fff",
        }}>
          <div style={{ padding: "10px 14px", background: "#f8f9ff", borderBottom: "1px solid #e9ecef" }}>
            <Text strong style={{ fontSize: 13, color: "#4361ee" }}>💬 Chat · {roleLabel}</Text>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <ChatWindow stage={currentStage} userId={userId} sessionId={sessionId} />
          </div>
        </div>
      </Content>
    </Layout>
  );
}
