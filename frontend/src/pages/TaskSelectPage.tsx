import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Typography, Tag, message, Spin, Progress } from "antd";
import { PlayCircleOutlined, CheckCircleOutlined, LogoutOutlined, CodeOutlined, RightOutlined } from "@ant-design/icons";
import { getTaskList } from "../services/taskService";
import { useAppStore } from "../store/useAppStore";
import type { Task } from "../types";

const { Title, Text } = Typography;

const taskIcons = ["🔵", "🟠", "🟢", "🟣"];
const taskGradients = [
  "linear-gradient(135deg, #4F46E5, #6366F1)",
  "linear-gradient(135deg, #F59E0B, #F97316)",
  "linear-gradient(135deg, #22C55E, #10B981)",
  "linear-gradient(135deg, #8B5CF6, #A78BFA)",
];

export default function TaskSelectPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const completedStages = useAppStore((s) => s.completedStages);
  const navigate = useNavigate();
  const { user, setSelectedTask, resetTeachingState } = useAppStore();

  useEffect(() => { if (!user) { navigate("/"); return; } loadData(); }, []);

  const loadData = async () => {
    try { setTasks(await getTaskList()); } catch { message.error("Failed to load"); } finally { setLoading(false); }
  };

  const handleStartTask = async (task: Task) => {
    try { resetTeachingState(); setSelectedTask(task); navigate(`/teach/${task.id}`); }
    catch { message.error("Failed to start task"); }
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f5f7ff" }}><Spin size="large" /></div>;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #EEF2FF 0%, #f5f7ff 40%)" }}>
      {/* Top bar */}
      <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid #E8E8FF", padding: "16px 0", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4F46E5, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CodeOutlined style={{ color: "#fff", fontSize: 18 }} />
            </div>
            <Text strong style={{ fontSize: 16, color: "#312E81" }}>BlockPython</Text>
          </div>
          <Button icon={<LogoutOutlined />} type="text" onClick={() => { sessionStorage.clear(); navigate("/"); }} style={{ color: "#6B7280" }}>Logout</Button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 32 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>Hello, {user?.name || user?.id}</Text>
          <Title level={2} style={{ margin: "4px 0 0", color: "#1E1B4B" }}>Select a Task</Title>
          <Text type="secondary">{tasks.length} tasks — complete in order for best results</Text>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {tasks.map((task, idx) => {
            const taskStages = [...completedStages].filter((k) => k.startsWith(`${task.id}-`));
            const completedCount = taskStages.length;
            const isCompleted = completedCount === 4;
            const isInProgress = completedCount > 0 && completedCount < 4;

            return (
              <Card key={task.id} hoverable onClick={() => handleStartTask(task)}
                style={{
                  borderRadius: 14, overflow: "hidden",
                  border: isInProgress ? "2px solid #4361ee" : isCompleted ? "2px solid #22C55E" : "1px solid #E8E8FF",
                  transition: "all 0.2s ease",
                }}
                styles={{ body: { padding: 0 } }}>
                <div style={{ display: "flex" }}>
                  {/* Left accent bar */}
                  <div style={{
                    width: 6, flexShrink: 0,
                    background: taskGradients[idx % taskGradients.length],
                  }} />
                  <div style={{ flex: 1, padding: "20px 24px", display: "flex", alignItems: "center", gap: 20 }}>
                    {/* Number badge */}
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                      background: isCompleted ? "#F0FDF4" : isInProgress ? "#EEF2FF" : "#F3F4F6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: isCompleted ? "2px solid #BBF7D0" : isInProgress ? "2px solid #C7D2FE" : "2px solid #E5E7EB",
                    }}>
                      {isCompleted
                        ? <CheckCircleOutlined style={{ fontSize: 24, color: "#22C55E" }} />
                        : <span style={{ fontSize: 20, fontWeight: 700, color: isInProgress ? "#4361ee" : "#9CA3AF" }}>{task.sort_order}</span>
                      }
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Text strong style={{ fontSize: 16, color: "#1F2937" }}>{task.title}</Text>
                        {isCompleted && <Tag color="success" style={{ margin: 0, borderRadius: 6 }}>Completed</Tag>}
                        {isInProgress && <Tag color="processing" style={{ margin: 0, borderRadius: 6 }}>In Progress</Tag>}
                      </div>
                      <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{task.description}</Text>
                      {isInProgress && (
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Progress percent={Math.round((completedCount / 4) * 100)} size="small"
                            style={{ flex: 1, maxWidth: 200 }}
                            strokeColor={{ from: "#4361ee", to: "#7209b7" }} />
                          <Text type="secondary" style={{ fontSize: 12 }}>{completedCount}/4 stages</Text>
                        </div>
                      )}
                    </div>
                    {/* Action icon */}
                    <RightOutlined style={{ color: "#D1D5DB", fontSize: 18, flexShrink: 0 }} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
