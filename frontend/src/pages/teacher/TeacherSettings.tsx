import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout, Menu, Button, Card, Typography, Input, message, Space } from "antd";
import { TeamOutlined, FileTextOutlined, RobotOutlined, ArrowLeftOutlined, LockOutlined, SettingOutlined } from "@ant-design/icons";
import api from "../../services/api";

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

export default function TeacherSettings() {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) { message.warning("Please fill in both passwords"); return; }
    setLoading(true);
    try {
      await api.put("/teacher/change-password", { oldPassword: oldPwd, newPassword: newPwd });
      message.success("Password changed, will take effect on next login");
      setOldPwd(""); setNewPwd("");
    } catch (e: any) {
      message.error(e?.response?.data?.error || "Change failed");
    } finally { setLoading(false); }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529", display: "flex", alignItems: "center", padding: "0 24px" }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/teacher")} style={{ color: "#fff" }}>Back</Button>
        <span style={{ color: "#fff", fontSize: 18, marginLeft: 16 }}>System Settings</span>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: "#fafafa" }}>
          <Menu mode="inline" style={{ height: "100%" }} onClick={({ key }) => navigate(key)}
            items={[
              { key: "/teacher/students", icon: <TeamOutlined />, label: "Student Data" },
              { key: "/teacher/tasks", icon: <FileTextOutlined />, label: "Task Management" },
              { key: "/teacher/prompts", icon: <RobotOutlined />, label: "Prompt Management" },
              { key: "/teacher/settings", icon: <SettingOutlined />, label: "System Settings" },
            ]} />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Title level={4}>System Settings</Title>
          <Card title="Change Teacher Password" style={{ maxWidth: 500 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Input.Password prefix={<LockOutlined />} placeholder="Old Password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
              <Input.Password prefix={<LockOutlined />} placeholder="New Password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
              <Button type="primary" loading={loading} onClick={handleChangePwd}>Change Password</Button>
            </Space>
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}
