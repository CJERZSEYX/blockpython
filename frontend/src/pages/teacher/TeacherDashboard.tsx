import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout, Menu, Button, Card, Row, Col, Statistic, Table, Typography, Tag, Spin, Progress } from "antd";
import { TeamOutlined, FileTextOutlined, RobotOutlined, ArrowLeftOutlined, UserOutlined, CheckCircleOutlined, BarChartOutlined, ExportOutlined, SettingOutlined } from "@ant-design/icons";
import api from "../../services/api";
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const stageColors: Record<string, string> = { P: "blue", A: "orange", C: "green", I: "purple" };
const stageNames: Record<string, string> = { P: "Understand", A: "Practice", C: "Challenge", I: "Interact" };
const actionLabels: Record<string, string> = {
  stage_enter: "Enter Stage", stage_exit: "Exit Stage", button_click: "Click Button",
  subtask_click: "View Subtask", block_click: "View Block",
  a_submit: "Submit Block", chat_send: "Student Question", chat_receive: "LLM Reply",
  c_run: "Run Code", c_hint_request: "Request Hint",
  i_collab_start: "Start Collaboration", i_code_run: "Explore Code", llm_system_trigger: "System Hint",
};

export default function TeacherDashboard() {
  const [data, setData] = useState<any>(null);
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const { data: stats } = await api.get("/teacher/stats");
      const { data: actions } = await api.get("/teacher/recent-actions");
      const { data: studentData } = await api.get("/teacher/students");
      const { data: charts } = await api.get("/teacher/stats/charts").catch(() => ({ data: null }));
      setData(stats);
      setRecentActions(actions?.actions || []);
      setStudents(studentData?.students || []);
      setChartData(charts);
    } catch {} finally { setLoading(false); }
  };

  const totalStudents = data?.totalStudents || 0;
  const totalCompleted = data?.completedTasks || 0;
  const activeStudents = data?.activeStudents || 0;
  const completionRate = data?.completionRate || 0;

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}><Spin size="large" /></div>;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/")} style={{ color: "#fff" }}>Exit</Button>
          <Text strong style={{ color: "#fff", fontSize: 18 }}>Teacher Admin</Text>
        </div>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: "#fafafa" }}>
          <Menu mode="inline" style={{ height: "100%", borderRight: 0 }} onClick={({ key }) => navigate(key)}
            items={[
              { key: "/teacher/students", icon: <TeamOutlined />, label: "Student Data" },
              { key: "/teacher/tasks", icon: <FileTextOutlined />, label: "Task Management" },
              { key: "/teacher/prompts", icon: <RobotOutlined />, label: "Prompt Management" },
              { key: "/teacher/settings", icon: <SettingOutlined />, label: "System Settings" },
            ]} />
        </Sider>
        <Content style={{ padding: 24, background: "#f5f5f5" }}>
          <Title level={4} style={{ marginBottom: 16 }}>Data Overview</Title>

          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card hoverable onClick={() => navigate("/teacher/students")}>
                <Statistic title="Total Students" value={totalStudents} prefix={<UserOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="Active Students" value={activeStudents} prefix={<TeamOutlined />} valueStyle={{ color: "#1677ff" }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="Tasks Completed" value={totalCompleted} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#52c41a" }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="Completion Rate" value={completionRate} suffix="%" prefix={<BarChartOutlined />} valueStyle={{ color: "#722ed1" }} />
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={24}>
              <Card title="Task Completion Status">
                <Table columns={[
                  { title: "Task", dataIndex: "title", key: "title" },
                  { title: "Order", dataIndex: "sort_order", key: "sort_order", width: 60 },
                  { title: "Started", dataIndex: "started_count", key: "started", width: 80 },
                  { title: "Completed", dataIndex: "completed_count", key: "completed", width: 80 },
                  { title: "Rate", key: "rate", width: 100, render: (_: any, r: any) => {
                    const rate = r.started_count > 0 ? Math.round((r.completed_count / r.started_count) * 100) : 0;
                    return <Progress percent={rate} size="small" />;
                  }},
                ]} dataSource={data?.taskStats || []} rowKey="id" pagination={false} size="small" />
              </Card>
            </Col>
          </Row>

          {chartData && (
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={12}>
                <Card title="Stage A Submission Stats">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={[
                      { name: "Passed", count: Number(chartData.aSubmitStats?.passed) || 0 },
                      { name: "Failed", count: Number(chartData.aSubmitStats?.failed) || 0 },
                    ]}>
                      <XAxis dataKey="name" /><YAxis allowDecimals={false} />
                      <Bar dataKey="count" fill="#52c41a" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={12}>
                <Card title="Stage Actions Distribution">
                  {(() => {
                    const stageData = ["P","A","C","I"].map((s) => ({
                      name: stageNames[s],
                      value: (chartData.stageActions || []).filter((a: any) => a.stage === s).reduce((sum: number, a: any) => sum + Number(a.count), 0),
                    })).filter((d) => d.value > 0);
                    return stageData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={stageData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                            {["#1677ff","#fa8c16","#52c41a","#722ed1"].map((c,i) => <Cell key={i} fill={c} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <div style={{ textAlign:"center", padding:40, color:"#999" }}>No data</div>;
                  })()}
                </Card>
              </Col>
            </Row>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Card title="Student Progress Overview" extra={<Button type="link" onClick={() => navigate("/teacher/students")}>View All</Button>}>
                <Table columns={[
                  { title: "Student ID", dataIndex: "id", key: "id" },
                  { title: "Progress", key: "progress", render: (_: any, r: any) => (
                    <span>{r.tasks_completed || 0} / {r.tasks_started || 0}</span>
                  )},
                  { title: "Status", key: "status", render: (_: any, r: any) => (
                    r.tasks_completed >= r.tasks_started && r.tasks_started > 0
                      ? <Tag color="success">All Completed</Tag>
                      : r.tasks_started > 0 ? <Tag color="processing">In Progress</Tag> : <Tag>Not Started</Tag>
                  )},
                ]} dataSource={students.slice(0, 8)} rowKey="id" pagination={false} size="small" />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Recent Activity" extra={<Button type="link" icon={<ExportOutlined />} onClick={() => window.open("http://localhost:3001/api/teacher/export-all")}>Export Data</Button>}>
                {recentActions.slice(0, 10).map((a: any, i: number) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: i < 9 ? "1px solid #f0f0f0" : "none", display: "flex", alignItems: "center", gap: 8 }}>
                    <Text strong style={{ minWidth: 60 }}>{a.user_name || a.user_id}</Text>
                    <Tag>{a.task_title || "—"}</Tag>
                    <Tag color={stageColors[a.stage]}>{stageNames[a.stage] || a.stage}</Tag>
                    <Text style={{ flex: 1 }}>{actionLabels[a.action_type] || a.action_type}</Text>
                    <Text type="secondary" style={{ fontSize: 11, minWidth: 130 }}>{a.timestamp?.substring(5, 19)}</Text>
                  </div>
                ))}
                {recentActions.length === 0 && <Text type="secondary">No activity data</Text>}
              </Card>
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
}
