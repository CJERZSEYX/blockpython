import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Form, Input, Typography, message, Divider } from "antd";
import { UserOutlined, LockOutlined, SettingOutlined } from "@ant-design/icons";
import { login } from "../../services/authService";
import { useAppStore } from "../../store/useAppStore";

const { Title, Text } = Typography;

export default function TeacherLoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useAppStore((s) => s.setUser);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const data = await login(values.username, values.password, "teacher");
      setUser(data.user, data.session_id);
      navigate("/teacher");
    } catch { message.error("Incorrect username or password"); } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center",
      background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4F46E5 100%)",
      position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
      <div style={{ position: "absolute", bottom: -80, left: -80, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.02)" }} />

      <Card style={{
        width: 420, borderRadius: 16,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
      }} bodyStyle={{ padding: "40px 36px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px",
            background: "linear-gradient(135deg, #312E81, #4F46E5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(49,46,129,0.3)",
          }}>
            <SettingOutlined style={{ fontSize: 26, color: "#fff" }} />
          </div>
          <Title level={3} style={{ margin: 0, color: "#1E1B4B" }}>Teacher Admin</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>BlockPython</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: "Please enter your username" }]}>
            <Input prefix={<UserOutlined style={{ color: "#A5B4FC" }} />} placeholder="Username" style={{ borderRadius: 10, height: 46 }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "Please enter your password" }]}>
            <Input.Password prefix={<LockOutlined style={{ color: "#A5B4FC" }} />} placeholder="Password" style={{ borderRadius: 10, height: 46 }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={{ height: 46, borderRadius: 10, fontSize: 16, fontWeight: 500,
                boxShadow: "0 4px 12px rgba(79,70,229,0.35)" }}>
              Teacher Login
            </Button>
          </Form.Item>
        </Form>

        <Divider plain style={{ margin: "8px 0" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Back to</Text>
        </Divider>
        <div style={{ textAlign: "center" }}>
          <Button type="link" onClick={() => navigate("/")} style={{ color: "#6366F1" }}>Student Login</Button>
        </div>
      </Card>
    </div>
  );
}
