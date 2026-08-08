import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Form, Input, Typography, Divider } from "antd";
import { appMessage as message } from "../utils/appMessage";
import {
  LockOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { login } from "../services/authService";
import { useAppStore } from "../store/useAppStore";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") !== "session-expired") return;
    message.warning("登录已过期，请重新登录");
    window.history.replaceState({}, "", "/");
  }, []);

  const onFinish = async (values: { student_id: string; password: string }) => {
    setLoading(true);
    try {
      const data = await login(values.student_id, values.password, "student");
      setUser(data.user, data.session_id);
      navigate("/tasks");
    } catch { message.error("登录失败，请重试"); } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-visual">
          <img
            src="/login-programming-classroom.png"
            alt="学生在编程课堂中使用电脑学习"
          />
        </div>

        <Card className="login-card">
          <div className="login-brand">
            <div className="login-product-lockup">
              <img
                className="login-product-icon"
                src="/brand/blockpython-icon.png"
                alt=""
              />
              <Title level={2} className="page-title">BlockPython</Title>
            </div>
            <Text type="secondary" className="login-subtitle">
              从积木到代码，LLM 陪你一步步学编程
            </Text>
          </div>

          <Form layout="vertical" onFinish={onFinish} size="large" className="login-form">
            <Form.Item name="student_id" rules={[{ required: true, message: "请输入学号" }]}>
              <Input prefix={<UserOutlined />} placeholder="学号" className="login-input" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" className="login-input" />
            </Form.Item>
            <Form.Item className="login-submit-item">
              <Button type="primary" htmlType="submit" loading={loading} block className="login-submit">
                进入学习
              </Button>
            </Form.Item>
          </Form>

          <Divider plain className="teacher-divider">
            <Text type="secondary" className="teacher-divider-text">教师入口</Text>
          </Divider>
          <div className="teacher-entry">
            <Button type="link" onClick={() => navigate("/teacher/login")}>
              教师登录
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
