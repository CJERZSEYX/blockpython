import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Space, Statistic, Table, Tag, Typography } from "antd";
import { appMessage as message } from "../../utils/appMessage";
import {
  DownloadOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MessageOutlined,
  SearchOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { logout } from "../../services/authService";

const { Title, Text } = Typography;

interface StudentRow {
  id: string;
  name: string;
  created_at: string;
  action_count: number;
  message_count: number;
  first_activity: string | null;
  last_activity: string | null;
}

function formatTime(value: string | null) {
  if (!value) return "暂无记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function downloadFile(path: string, filename: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function TeacherStudents() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/teacher/students");
      setStudents(data.students);
    } catch {
      message.error("学生实验数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStudents(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return students;
    return students.filter(
      (student) =>
        student.id.toLowerCase().includes(keyword) ||
        (student.name || "").toLowerCase().includes(keyword),
    );
  }, [search, students]);

  const actionTotal = students.reduce((sum, row) => sum + Number(row.action_count || 0), 0);
  const messageTotal = students.reduce((sum, row) => sum + Number(row.message_count || 0), 0);

  const handleExport = async (type: "csv" | "json") => {
    try {
      await downloadFile(
        `/teacher/export.${type}`,
        type === "csv" ? "experiment_students.csv" : "experiment_full_data.json",
      );
      message.success("实验数据已导出");
    } catch {
      message.error("导出失败");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // 本地会话仍应允许退出。
    } finally {
      sessionStorage.clear();
      navigate("/teacher/login");
    }
  };

  return (
    <div className="teacher-data-page">
      <header className="teacher-data-header">
        <div>
          <Text className="teacher-data-kicker">ICAP 编程学习实验</Text>
          <Title level={3}>学生实验数据</Title>
        </div>
        <Button icon={<LogoutOutlined />} onClick={() => void handleLogout()}>退出登录</Button>
      </header>

      <main className="teacher-data-main">
        <section className="teacher-summary-strip" aria-label="实验数据摘要">
          <Statistic title="学生人数" value={students.length} prefix={<TeamOutlined />} />
          <Statistic title="操作记录" value={actionTotal} prefix={<FileTextOutlined />} />
          <Statistic title="对话消息" value={messageTotal} prefix={<MessageOutlined />} />
        </section>

        <section className="teacher-data-section">
          <div className="teacher-data-toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索学号或姓名"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Space>
              <Button icon={<DownloadOutlined />} onClick={() => void handleExport("csv")}>
                导出 CSV 摘要
              </Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={() => void handleExport("json")}>
                导出 JSON 完整包
              </Button>
            </Space>
          </div>

          <Table<StudentRow>
            rowKey="id"
            loading={loading}
            dataSource={filteredStudents}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            columns={[
              { title: "学号", dataIndex: "id", width: 150 },
              { title: "姓名", dataIndex: "name", width: 130, render: (value) => value || "未填写" },
              {
                title: "实验记录",
                dataIndex: "action_count",
                width: 110,
                render: (value) => <Tag color="blue">{Number(value)} 条</Tag>,
              },
              {
                title: "对话消息",
                dataIndex: "message_count",
                width: 110,
                render: (value) => <Tag color="cyan">{Number(value)} 条</Tag>,
              },
              {
                title: "首次操作",
                dataIndex: "first_activity",
                render: formatTime,
              },
              {
                title: "最近操作",
                dataIndex: "last_activity",
                render: formatTime,
              },
              {
                title: "",
                width: 90,
                render: (_, row) => (
                  <Button type="link" onClick={() => navigate(`/teacher/students/${row.id}`)}>
                    查看详情
                  </Button>
                ),
              },
            ]}
          />
        </section>
      </main>
    </div>
  );
}
