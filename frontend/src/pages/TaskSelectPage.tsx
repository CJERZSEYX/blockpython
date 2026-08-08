import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Card, Button, Drawer, Typography, Spin, Tag } from "antd";
import { appMessage as message } from "../utils/appMessage";
import {
  AimOutlined,
  ApartmentOutlined,
  ForkOutlined,
  LogoutOutlined,
  MessageOutlined,
  RightOutlined,
  RocketOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { getTaskList } from "../services/taskService";
import { useAppStore } from "../store/useAppStore";
import type { Task } from "../types";
import { logout } from "../services/authService";
import { getRecentLearningState } from "../services/learningStateService";
import { getStudentLearningAdvice } from "../services/learningProfileService";
import StudentLearningAdviceCard from "../components/LearningAdvice/StudentLearningAdviceCard";
import type { StudentLearningAdvice, StudentTaskState } from "../types";

const { Title, Text } = Typography;

const taskPresentation = [
  { label: "顺序", icon: <MessageOutlined />, accent: "#3568f0" },
  { label: "变量", icon: <AimOutlined />, accent: "#e58a24" },
  { label: "分支", icon: <ForkOutlined />, accent: "#13a67f" },
  { label: "循环", icon: <SyncOutlined />, accent: "#7654d6" },
  { label: "嵌套", icon: <ApartmentOutlined />, accent: "#d35e7f" },
  { label: "综合", icon: <RocketOutlined />, accent: "#167d91" },
];

export default function TaskSelectPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [recentState, setRecentState] = useState<StudentTaskState | null>(null);
  const [adviceTask, setAdviceTask] = useState<Task | null>(null);
  const [advice, setAdvice] = useState<StudentLearningAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const navigate = useNavigate();
  const { user, setSelectedTask, resetTeachingState } = useAppStore();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const taskList = await getTaskList();
      setTasks(taskList);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    let active = true;
    Promise.all([getTaskList(), getRecentLearningState()])
      .then(([taskList, recent]) => {
        if (active) {
          setTasks(taskList);
          setRecentState(recent);
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, user]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // 即使网络断开，也应允许学生离开本地会话。
    } finally {
      sessionStorage.clear();
      navigate("/");
    }
  };

  const handleStartTask = async (task: Task) => {
    try { resetTeachingState(); setSelectedTask(task); navigate(`/teach/${task.id}`); }
    catch { message.error("开始任务失败"); }
  };

  const handleViewAdvice = async (task: Task) => {
    setAdviceTask(task);
    setAdvice(null);
    setAdviceLoading(true);
    try {
      const response = await getStudentLearningAdvice(task.id);
      setAdvice(response.student_advice);
    } catch {
      message.error("学习小结暂时无法加载");
    } finally {
      setAdviceLoading(false);
    }
  };

  if (loading) return <div className="app-shell app-loading"><Spin size="large" /></div>;

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="top-bar-inner">
          <div className="brand-row">
            <span className="brand-symbol" aria-hidden="true">
              <img src="/brand/blockpython-icon.png" alt="" />
            </span>
            <Text className="brand-title">BlockPython</Text>
          </div>
          <Button className="top-bar-action" icon={<LogoutOutlined />} type="text" onClick={() => void handleLogout()}>退出</Button>
        </div>
      </div>

      <main className="task-page-main">
        <section className="task-page-heading">
          <div>
            <div className="page-kicker">你好，{user?.name || user?.id}</div>
            <Title level={2} className="page-title">今天从哪个任务开始？</Title>
          </div>
          <div className="course-overview" aria-label="课程知识路线">
            <span>输出</span><RightOutlined />
            <span>变量</span><RightOutlined />
            <span>条件</span><RightOutlined />
            <span>循环</span><RightOutlined />
            <span>综合</span>
          </div>
        </section>

        {loadError && (
          <Alert
            className="task-load-error"
            type="error"
            showIcon
            title="任务列表暂时无法加载"
            description={<Button type="link" onClick={() => void loadTasks()}>重新加载</Button>}
          />
        )}

        <div className="quest-map">
          <div className="quest-route" aria-hidden="true" />
          {tasks.map((task, idx) => {
            const presentation = taskPresentation[idx] || taskPresentation[taskPresentation.length - 1];
            const isRecent = recentState?.task_id === task.id;
            return (
              <Card
                key={task.id}
                hoverable
                role="button"
                tabIndex={0}
                onClick={() => handleStartTask(task)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void handleStartTask(task);
                  }
                }}
                className="task-card"
                style={{ "--task-accent": presentation.accent } as CSSProperties}
                styles={{ body: { padding: 0 } }}>
                <div className="task-card-body">
                  <div className="task-card-top">
                    <div className="task-card-identity">
                      <div className="task-number">
                        <span>{task.sort_order || idx + 1}</span>
                      </div>
                      <div className="task-topic-icon">{presentation.icon}</div>
                    </div>
                    <span className="task-topic-label">{presentation.label}</span>
                  </div>
                  <div className="task-card-copy">
                    <div className="task-title">{task.title}</div>
                    {task.suggested_lessons > 1 && <Tag color="blue">建议 {task.suggested_lessons} 课时</Tag>}
                    {isRecent && <Tag color="geekblue">上次学习</Tag>}
                  </div>
                  <div className="task-desc">{task.description}</div>
                  <div className="task-card-footer">
                    {task.has_learning_advice ? (
                      <Button
                        type="link"
                        className="task-advice-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleViewAdvice(task);
                        }}
                      >
                        查看学习小结
                      </Button>
                    ) : <span>{isRecent ? "继续学习" : "查看任务"}</span>}
                    <span className="task-enter-icon"><RightOutlined /></span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
      <Drawer
        title={adviceTask ? `${adviceTask.title} · 学习小结` : "本任务学习小结"}
        width={460}
        open={Boolean(adviceTask)}
        onClose={() => setAdviceTask(null)}
      >
        {adviceLoading ? <div className="advice-drawer-loading"><Spin /></div> : advice ? (
          <StudentLearningAdviceCard advice={advice} compact />
        ) : (
          <Alert type="info" showIcon title="学习小结正在整理" description="完成代码挑战后，这里会出现本任务的学习建议。" />
        )}
      </Drawer>
    </div>
  );
}
