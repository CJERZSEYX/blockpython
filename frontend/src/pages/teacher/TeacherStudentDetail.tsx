import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout, Menu, Button, Table, Typography, Tag, Tabs, Card, Space } from "antd";
import { TeamOutlined, FileTextOutlined, RobotOutlined, SettingOutlined, ArrowLeftOutlined, ExportOutlined } from "@ant-design/icons";
import api from "../../services/api";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const stageColors: Record<string, string> = { P: "blue", A: "orange", C: "green", I: "purple" };
const actionLabels: Record<string, string> = {
  stage_enter: "Enter Stage", stage_exit: "Exit Stage", button_click: "Click Button",
  subtask_click: "Click Subtask", block_click: "Click Block",
  a_submit: "Submit Block", chat_send: "Send Message", chat_receive: "Receive Reply",
  c_run: "Run Code", c_hint_request: "Request Hint", i_collab_start: "Start Collaboration", i_code_run: "Explore Code",
  llm_system_trigger: "System Auto-Hint",
};
const stageNames: Record<string, string> = { P: "Understand", A: "Practice", C: "Challenge", I: "Interact" };

export default function TeacherStudentDetail() {
  const { id } = useParams<{ id: string }>();
  const [progress, setProgress] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const { data } = await api.get(`/teacher/students/${id}`);
      setProgress(data.progress);
      setActions(data.actions);
    } catch {} finally { setLoading(false); }
  };

  const actionsByTask: Record<number, any[]> = {};
  actions.forEach((a) => {
    if (!a.task_id) return;
    if (!actionsByTask[a.task_id]) actionsByTask[a.task_id] = [];
    actionsByTask[a.task_id].push(a);
  });

  const actionColumns = [
    { title: "Time", dataIndex: "timestamp", key: "time", render: (v: string) => v?.substring(0, 19), width: 160 },
    { title: "Stage", dataIndex: "stage", key: "stage", width: 80, render: (v: string) => v ? <Tag color={stageColors[v]}>{stageNames[v] || v}</Tag> : null },
    { title: "Action", dataIndex: "action_type", key: "type", width: 120, render: (v: string) => actionLabels[v] || v },
    { title: "Detail", dataIndex: "action_detail", key: "detail", render: (v: any) => {
      if (!v) return "-";
      if (typeof v === "string") return v.substring(0, 50);
      return JSON.stringify(v).substring(0, 50);
    }},
  ];

  const tabItems = [
    {
      key: "overview",
      label: "Progress Overview",
      children: (
        <Table columns={[
          { title: "Task", dataIndex: "task_title", key: "task" },
          { title: "Current Stage", dataIndex: "current_stage", key: "stage", render: (v: string) => v ? <Tag color={stageColors[v]}>{stageNames[v] || v}</Tag> : null },
          { title: "Status", dataIndex: "status", key: "status", render: (v: string) => v === "completed" ? <Tag color="success">Completed</Tag> : v === "in_progress" ? <Tag color="processing">In Progress</Tag> : <Tag>Not Started</Tag> },
          { title: "Start Time", dataIndex: "started_at", key: "started", render: (v: string) => v?.substring(0, 16) },
        ]} dataSource={progress} loading={loading} rowKey="task_id" pagination={false} size="small" />
      ),
    },
    ...progress.map((p) => ({
      key: `task-${p.task_id}`,
      label: p.task_title || `Task ${p.task_id}`,
      children: (
        <Card size="small" title={<Space>{p.task_title} <Tag color="processing">{p.status}</Tag></Space>}>
          {actionsByTask[p.task_id]?.length > 0
            ? <Table columns={actionColumns} dataSource={actionsByTask[p.task_id] || []} rowKey={(_, i) => String(i)} pagination={false} size="small" />
            : <Text type="secondary">No action records for this task</Text>}
        </Card>
      ),
    })),
    {
      key: "all",
      label: "All Actions",
      children: <Table columns={actionColumns} dataSource={actions} rowKey={(_, i) => String(i)} pagination={{ pageSize: 20 }} size="small" />,
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/teacher/students")} style={{ color: "#fff" }}>Back</Button>
          <span style={{ color: "#fff", fontSize: 18 }}>Student Detail: {id}</span>
        </Space>
        <Button icon={<ExportOutlined />} onClick={() => window.open(`http://localhost:3001/api/teacher/students/${id}/export`)}>Export CSV</Button>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: "#fafafa" }}>
          <Menu mode="inline" style={{ height: "100%" }} onClick={({ key }) => navigate(key)}
            items={[
              { key: "/teacher/students", icon: <TeamOutlined />, label: "Student Data" },
              { key: "/teacher/tasks", icon: <FileTextOutlined />, label: "Task Management" },
              { key: "/teacher/prompts", icon: <RobotOutlined />, label: "Prompt Management" },{ key: "/teacher/settings", icon: <SettingOutlined />, label: "System Settings" },
            ]} />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Tabs items={tabItems} />
        </Content>
      </Layout>
    </Layout>
  );
}
