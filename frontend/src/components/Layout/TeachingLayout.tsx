import { Layout, Button, Modal, Typography } from "antd";
import {
  ArrowLeftOutlined,
  AppstoreOutlined,
  FlagOutlined,
  MessageOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import BlocklyEditor from "../BlocklyEditor/BlocklyEditor";
import type { BlocklyEditorHandle } from "../BlocklyEditor/BlocklyEditor";
import type { Task, Stage, TaskContent } from "../../types";
import TaskPanel from "../TaskPanel/TaskPanel";
import ChatWindow from "../ChatWindow/ChatWindow";
import StageButtons from "../StageController/StageButtons";
import { trackAction } from "../../services/trackService";
import { useAppStore } from "../../store/useAppStore";

const { Header, Content } = Layout;
const { Text } = Typography;

interface TeachingLayoutProps {
  blocklyRef: React.RefObject<BlocklyEditorHandle | null>;
  selectedTask: Task;
  currentStage: Stage;
  userId: string;
  sessionId: string;
  taskContent: TaskContent | null;
  onStageChange: (stage: Stage) => void | Promise<void>;
  onBack: () => void;
}

export default function TeachingLayout({
  blocklyRef, selectedTask,
  userId, sessionId, taskContent, currentStage, onStageChange, onBack,
}: TeachingLayoutProps) {
  const agentAnchor = useAppStore((state) => state.agentAnchor);
  const learningState = useAppStore((state) => state.learningState);
  const cStageBlocksXml = useAppStore((state) => state.cStageBlocksXml);
  const handleResetWorkspace = () => {
    if (currentStage === "I") {
      if (cStageBlocksXml) blocklyRef.current?.loadXml(cStageBlocksXml);
      window.setTimeout(() => blocklyRef.current?.resetView(), 50);
      trackAction({
        user_id: userId,
        session_id: sessionId,
        task_id: selectedTask.id,
        stage: "I",
        action_type: "i_reference_reset",
      });
      return;
    }
    if (currentStage !== "A" || learningState?.a_reference_hidden) return;
    const xml = blocklyRef.current?.getXml() || "";
    if (!xml.includes("<block")) {
      blocklyRef.current?.clearWorkspace();
      return;
    }
    Modal.confirm({
      title: "重新开始搭积木？",
      content: "当前工作区里的积木会被清空，本次登录期间无法撤销。",
      okText: "清空积木",
      cancelText: "继续搭建",
      okButtonProps: { danger: true },
      onOk: () => {
        blocklyRef.current?.clearWorkspace();
        trackAction({
          user_id: userId,
          session_id: sessionId,
          task_id: selectedTask.id,
          stage: "A",
          action_type: "a_workspace_reset",
        });
      },
    });
  };

  return (
    <Layout className="teaching-root">
      <Header className="teaching-header">
        <div className="teaching-header-content">
          <div className="teaching-nav">
            <span className="teaching-brand-mark" aria-hidden="true">
              <img src="/brand/blockpython-icon.png" alt="" />
            </span>
            <Button type="text" className="teaching-back" icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
            <span className="teaching-header-divider" />
            <Text strong className="teaching-title">{selectedTask.title}</Text>
          </div>
          <span className="role-pill">学习助手在线</span>
        </div>
      </Header>

      <Content className="teaching-content">
        <section className="workspace-pane">
          <div className="pane-header">
            <div className="pane-heading">
              <span className="pane-icon workspace-icon"><AppstoreOutlined /></span>
              <Text className="pane-title">积木编辑区</Text>
            </div>
            {currentStage === "A" && agentAnchor?.label && (
              <span className="agent-anchor-label">{agentAnchor.label}</span>
            )}
            <Button className="pane-tool-button" size="small" type="text" icon={<ReloadOutlined />}
              disabled={!((currentStage === "A" && !learningState?.a_reference_hidden) || (currentStage === "I" && Boolean(cStageBlocksXml)))}
              title={currentStage === "I"
                ? cStageBlocksXml ? "恢复并居中参考积木" : "参考积木正在加载"
                : learningState?.a_reference_hidden ? "已完成阶段仅供回顾" : "清空积木区"}
              onClick={handleResetWorkspace}>重置</Button>
          </div>
          <div className="pane-body pane-body-fixed">
            <BlocklyEditor ref={blocklyRef} />
          </div>
        </section>

        <section className="task-pane">
          <div className="pane-header">
            <div className="pane-heading">
              <span className="pane-icon task-icon"><FlagOutlined /></span>
              <Text className="pane-title">任务展示区</Text>
            </div>
          </div>
          <div className="pane-body task-pane-scroll">
            <TaskPanel key={selectedTask.id} stage={currentStage} taskId={selectedTask.id} taskContent={taskContent} blocklyRef={blocklyRef} />
          </div>
          <div className="stage-footer">
            <StageButtons currentStage={currentStage} onStageChange={onStageChange} />
          </div>
        </section>

        <section className="chat-pane">
          <div className="pane-header">
            <div className="pane-heading">
              <span className="pane-icon chat-icon"><MessageOutlined /></span>
              <Text className="pane-title">学习助手</Text>
            </div>
            <span className="assistant-status" aria-hidden="true" />
          </div>
          <div className="pane-body pane-body-fixed">
            <ChatWindow key={selectedTask.id} stage={currentStage} userId={userId} sessionId={sessionId} />
          </div>
        </section>
      </Content>
    </Layout>
  );
}
