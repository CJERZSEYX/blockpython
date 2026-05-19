import { useEffect, useState } from "react";
import { Layout, Menu, Button, Table, Typography, message, Popconfirm, Input, Space } from "antd";
import { TeamOutlined, FileTextOutlined, RobotOutlined, SettingOutlined, ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

export default function TeacherStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => { loadStudents(); }, []);

  const loadStudents = async () => {
    try {
      const { data } = await api.get("/teacher/students");
      setStudents(data.students);
    } catch { message.error("Load failed"); } finally { setLoading(false); }
  };

  const handleExport = (id: string) => {
    window.open(`http://localhost:3001/api/teacher/students/${id}/export`);
  };

  const handleExportAll = () => {
    window.open(`http://localhost:3001/api/teacher/export-all`);
  };

  const handleDelete = async (id: string) => {
    try { await api.delete(`/teacher/students/${id}`); message.success("Deleted"); loadStudents(); }
    catch { message.error("Delete failed"); }
  };

  const columns = [
    { title: "Student ID", dataIndex: "id", key: "id" },
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Registered", dataIndex: "created_at", key: "created_at", render: (v: string) => v?.substring(0, 10) },
    { title: "Started", dataIndex: "tasks_started", key: "tasks_started", width: 60 },
    { title: "Completed", dataIndex: "tasks_completed", key: "tasks_completed", width: 60 },
    {
      title: "Actions", key: "actions",
      render: (_: any, r: any) => (
        <>
          <Button type="link" onClick={() => navigate(`/teacher/students/${r.id}`)}>Details</Button>
          <Button type="link" onClick={() => handleExport(r.id)}>Export</Button>
          <Popconfirm title="Are you sure you want to delete this student and all their data?" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/teacher")} style={{ color: "#fff" }}>Back</Button>
        <span style={{ color: "#fff", fontSize: 18 }}>Teacher Admin</span>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: "#fafafa" }}>
          <Menu mode="inline" style={{ height: "100%" }} selectedKeys={["/teacher/students"]} onClick={({ key }) => navigate(key)}
            items={[
              { key: "/teacher/students", icon: <TeamOutlined />, label: "Student Data" },
              { key: "/teacher/tasks", icon: <FileTextOutlined />, label: "Task Management" },
              { key: "/teacher/prompts", icon: <RobotOutlined />, label: "Prompt Management" },{ key: "/teacher/settings", icon: <SettingOutlined />, label: "System Settings" },
            ]} />
        </Sider>
        <Content style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0 }}>Student Data</Title>
            <Space>
              <Input.Search placeholder="Search by student ID or name" allowClear style={{ width: 200 }} value={search} onChange={(e) => setSearch(e.target.value)} />
              <Button type="primary" onClick={handleExportAll}>Export All Data</Button>
            </Space>
          </div>
          <Table columns={columns} dataSource={students.filter((s) => !search || s.id.includes(search) || (s.name || "").includes(search))} loading={loading} rowKey="id" />
        </Content>
      </Layout>
    </Layout>
  );
}
