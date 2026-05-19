import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Form, Input, Typography, message, Divider } from "antd";
import { UserOutlined, LockOutlined, CodeOutlined } from "@ant-design/icons";
import { login } from "../services/authService";
import { useAppStore } from "../store/useAppStore";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useAppStore((s) => s.setUser);

  const onFinish = async (values: { student_id: string; password: string }) => {
    setLoading(true);
    try {
      const data = await login(values.student_id, values.password, "student");
      setUser(data.user, data.session_id);
      navigate("/tasks");
    } catch { message.error("Login failed, please try again"); } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center",
      background: "linear-gradient(135deg, #3a0ca3 0%, #4361ee 50%, #7209b7 100%)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -80, left: -80, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ position: "absolute", bottom: -120, right: -60, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
      <div style={{ position: "absolute", top: "30%", right: "15%", width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />

      <Card style={{
        width: 420, borderRadius: 16,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid rgba(255,255,255,0.3)",
      }} styles={{ body: { padding: "40px 36px" } }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
            background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(79,70,229,0.3)",
          }}>
            <CodeOutlined style={{ fontSize: 28, color: "#fff" }} />
          </div>
          <Title level={2} style={{ margin: 0, color: "#1E1B4B", letterSpacing: 2 }}>
            BlockPython
          </Title>
          <Text type="secondary" style={{ fontSize: 13, marginTop: 4, display: "block" }}>
            From Blocks to Code — LLM-Powered Step by Step
          </Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item name="student_id" rules={[{ required: true, message: "Please enter your Student ID" }]}>
            <Input prefix={<UserOutlined style={{ color: "#A5B4FC" }} />} placeholder="Student ID" style={{ borderRadius: 10, height: 46 }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "Please enter your password" }]}>
            <Input.Password prefix={<LockOutlined style={{ color: "#A5B4FC" }} />} placeholder="Password" style={{ borderRadius: 10, height: 46 }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={{ height: 46, borderRadius: 10, fontSize: 16, fontWeight: 500,
                boxShadow: "0 4px 12px rgba(79,70,229,0.35)" }}>
              Start Learning
            </Button>
          </Form.Item>
        </Form>

        <Divider plain style={{ margin: "8px 0" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Teacher Access</Text>
        </Divider>
        <div style={{ textAlign: "center" }}>
          <Button type="link" onClick={() => navigate("/teacher/login")}
            style={{ color: "#6366F1" }}>
            Teacher Login
          </Button>
        </div>
      </Card>
    </div>
  );
}
