import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Progress,
  Segmented,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { appMessage as message } from "../../utils/appMessage";
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import api from "../../services/api";
import BlocklySnapshotPreview from "../../components/teacher/BlocklySnapshotPreview";

const { Title, Text, Paragraph } = Typography;

interface StageTime {
  stage: string;
  label: string;
  active_ms: number;
  active_label: string;
  historical_ms: number;
}

interface Attempt {
  id: number;
  timestamp: string;
  stage: string;
  stage_label: string;
  result: string;
  result_label: string;
  location: string;
  diagnosis: string;
  blockly_xml: string;
  highlighted_block_id: string | null;
  generated_code: string;
  code: string;
  input: string;
  stdout: string;
}

interface TaskTimelineItem {
  id: number;
  timestamp: string;
  stage: string;
  stage_label: string;
  title: string;
  summary: string;
}

interface Conversation {
  id: number;
  stage: string;
  stage_label: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface Intervention {
  id: string;
  stage: string;
  stage_label: string;
  created_at: string;
  trigger_label: string;
  support_label: string;
  diagnosis: string;
  message: string;
  outcome_label: string;
}

interface LearningProfileSummary {
  summary_id: string;
  scope: "stage" | "task" | "course";
  task_id?: number;
  stage?: string;
  version: number;
  content: {
    sentences: string[];
    strengths: string[];
    difficulties: string[];
    support_use: string;
    revision_response: string;
    next_support: string;
    knowledge_components: string[];
  };
  is_stale: boolean;
  created_at: string;
}

interface TaskReport {
  id: number;
  title: string;
  description: string;
  active_time_ms: number;
  active_time_label: string;
  stage_times: StageTime[];
  a_completed: boolean;
  c_completed: boolean;
  attempt_count: number;
  hint_count: number;
  difficulties: Array<{ label: string; count: number }>;
  timeline: TaskTimelineItem[];
  attempts: Attempt[];
  conversations: Conversation[];
  interventions: Intervention[];
  learner_states: Array<{
    knowledge_component: string;
    state: string;
    success_count: number;
    error_count: number;
  }>;
  stage_summaries: LearningProfileSummary[];
  task_profile: LearningProfileSummary | null;
}

interface StudentReport {
  student: { id: string; name: string; created_at: string };
  total_active_time_ms: number;
  total_active_time_label: string;
  last_activity: string | null;
  course_profile: LearningProfileSummary | null;
  tasks: TaskReport[];
}

const stageColors: Record<string, string> = {
  P: "blue",
  A: "orange",
  C: "green",
  I: "purple",
};

const stateLabels: Record<string, string> = {
  not_observed: "尚无证据",
  needs_support: "需要支持",
  emerging: "正在形成",
  stable: "表现稳定",
};

const knowledgeLabels: Record<string, string> = {
  sequence_execution: "顺序执行",
  print_text: "输出与文本",
  block_connection: "积木连接",
  variable_assignment: "变量赋值",
  variable_read: "变量读取",
  arithmetic_add_subtract: "加减运算",
  input_string: "输入",
  text_comparison: "文本比较",
  if_else: "条件分支",
  for_range: "循环",
  indentation: "Python缩进",
  structure_nesting: "结构嵌套",
  coordinate_xy: "二维坐标",
  blocks_to_python_transfer: "积木到Python迁移",
};

function formatTime(value: string | null) {
  if (!value) return "暂无记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function resultColor(result: string) {
  if (result === "target_met") return "success";
  if (["syntax_error", "runtime_error", "timeout"].includes(result)) return "error";
  return "warning";
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

function ProfileSummary({
  title,
  summary,
  compact = false,
}: {
  title: string;
  summary: LearningProfileSummary | null;
  compact?: boolean;
}) {
  if (!summary) {
    return compact ? null : (
      <section className="teacher-report-section teacher-profile-section">
        <Title level={5}>{title}</Title>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前还没有足够的学习证据形成摘要" />
      </section>
    );
  }
  return (
    <section className={`teacher-report-section teacher-profile-section${compact ? " compact" : ""}`}>
      <div className="teacher-section-heading">
        <div>
          <Text strong>{title}</Text>
          <Text type="secondary">由可追溯的作品、运行、诊断和对话证据整理</Text>
        </div>
        <Text type="secondary">更新于 {formatTime(summary.created_at)}</Text>
      </div>
      <div className="teacher-profile-body">
        <ol className="teacher-profile-sentences">
          {summary.content.sentences.map((sentence, index) => <li key={`${index}-${sentence}`}>{sentence}</li>)}
        </ol>
        <div className="teacher-profile-facts">
          <div><Text type="secondary">已观察到的优势</Text><Text>{summary.content.strengths.join("、") || "证据仍在积累"}</Text></div>
          <div><Text type="secondary">需要关注</Text><Text>{summary.content.difficulties.join("、") || "暂未发现重复困难"}</Text></div>
          <div><Text type="secondary">后续支持重点</Text><Text>{summary.content.next_support}</Text></div>
        </div>
      </div>
    </section>
  );
}

function StageProfiles({ summaries = [] }: { summaries?: LearningProfileSummary[] }) {
  const ordered = ["P", "A", "C", "I"]
    .map((stage) => summaries.find((item) => item.stage === stage))
    .filter((item): item is LearningProfileSummary => Boolean(item));
  if (!ordered.length) return null;
  return (
    <section className="teacher-report-section teacher-stage-profiles">
      <Title level={5}>各阶段学习摘要</Title>
      <div className="teacher-stage-profile-grid">
        {ordered.map((summary) => (
          <article key={summary.summary_id} className="teacher-stage-profile-item">
            <div><Tag color={stageColors[summary.stage || ""]}>{summary.stage === "P" ? "任务理解" : summary.stage === "A" ? "积木练习" : summary.stage === "C" ? "代码挑战" : "拓展互动"}</Tag></div>
            {summary.content.sentences.map((sentence, index) => <Paragraph key={`${index}-${sentence}`}>{sentence}</Paragraph>)}
          </article>
        ))}
      </div>
    </section>
  );
}

function OverviewTab({ task }: { task: TaskReport }) {
  return (
    <div className="teacher-report-stack">
      <div className="teacher-overview-metrics">
        <Card><Statistic title="有效学习时间" value={task.active_time_label} prefix={<ClockCircleOutlined />} /></Card>
        <Card><Statistic title="关键尝试" value={task.attempt_count} suffix="次" /></Card>
        <Card><Statistic title="主动求助" value={task.hint_count} suffix="次" /></Card>
        <Card>
          <Text type="secondary">目标达成</Text>
          <div className="teacher-completion-row">
            <Tag color={task.a_completed ? "success" : "default"}>{task.a_completed ? <CheckCircleFilled /> : null} 积木练习</Tag>
            <Tag color={task.c_completed ? "success" : "default"}>{task.c_completed ? <CheckCircleFilled /> : null} 代码挑战</Tag>
          </div>
        </Card>
      </div>

      <section className="teacher-report-section">
        <Title level={5}>各阶段有效学习时间</Title>
        <div className="teacher-stage-time-grid">
          {task.stage_times.map((item) => {
            const percent = task.active_time_ms ? Math.round((item.active_ms / task.active_time_ms) * 100) : 0;
            return (
              <div key={item.stage} className="teacher-stage-time-item">
                <div><Tag color={stageColors[item.stage]}>{item.label}</Tag><Text strong>{item.active_label}</Text></div>
                <Progress percent={percent} showInfo={false} strokeColor={stageColors[item.stage]} />
                {!item.active_ms && item.historical_ms > 0 && <Text type="secondary">旧记录仅能估算停留时间</Text>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="teacher-report-section">
        <Title level={5}>主要学习证据</Title>
        <div className="teacher-evidence-grid">
          <div>
            <Text strong>当前困难</Text>
            {task.difficulties.length ? task.difficulties.map((item) => (
              <div key={item.label} className="teacher-difficulty-row">
                <span>{item.label}</span><Tag>{item.count}次</Tag>
              </div>
            )) : <Text type="secondary">尚未观察到重复困难</Text>}
          </div>
          <div>
            <Text strong>知识点证据状态</Text>
            <div className="teacher-state-tags">
              {task.learner_states.length ? task.learner_states.map((item) => (
                <Tag key={item.knowledge_component} color={item.state === "stable" ? "success" : item.state === "needs_support" ? "error" : "processing"}>
                  {knowledgeLabels[item.knowledge_component] || item.knowledge_component}：{stateLabels[item.state] || item.state}
                </Tag>
              )) : <Text type="secondary">当前任务尚无足够证据</Text>}
            </div>
          </div>
        </div>
      </section>

      <ProfileSummary title="本任务学习证据画像" summary={task.task_profile} compact />
      <StageProfiles summaries={task.stage_summaries} />

    </div>
  );
}

function AttemptCard({ attempt, showHeader = true }: { attempt: Attempt; showHeader?: boolean }) {
  return (
    <div className="teacher-attempt-card">
      {showHeader && <div className="teacher-attempt-header">
        <Space wrap>
          <Tag color={stageColors[attempt.stage]}>{attempt.stage_label}</Tag>
          <Tag color={resultColor(attempt.result)}>{attempt.result_label}</Tag>
          <Text strong>{attempt.location}</Text>
        </Space>
        <Text type="secondary">{formatTime(attempt.timestamp)}</Text>
      </div>}
      <Alert type={attempt.result === "target_met" ? "success" : "warning"} showIcon title={attempt.diagnosis} />
      {attempt.stage === "A" ? (
        <>
          <BlocklySnapshotPreview xml={attempt.blockly_xml} highlightedBlockId={attempt.highlighted_block_id} />
          {attempt.generated_code && (
            <Collapse ghost items={[{
              key: "generated",
              label: "查看这组积木生成的Python",
              children: <pre className="teacher-code-preview">{attempt.generated_code}</pre>,
            }]} />
          )}
        </>
      ) : (
        <div className="teacher-code-evidence">
          <pre className="teacher-code-preview">{attempt.code || "本次没有保存代码"}</pre>
          {(attempt.input || attempt.stdout) && (
            <div className="teacher-run-facts">
              {attempt.input && <span><Text type="secondary">输入</Text>{attempt.input}</span>}
              {attempt.stdout && <span><Text type="secondary">输出</Text>{attempt.stdout}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProcessTab({ task }: { task: TaskReport }) {
  if (!task.attempts.length && !task.timeline.length) {
    return <Empty description="这个任务还没有学习过程记录" />;
  }
  return (
    <div className="teacher-process-layout">
      <section className="teacher-report-section">
        <Title level={5}>关键尝试与错误演变</Title>
        <Collapse
          className="teacher-attempt-collapse"
          accordion
          destroyOnHidden
          defaultActiveKey={task.attempts.length ? [String(task.attempts.at(-1)?.id)] : []}
          items={task.attempts.map((attempt) => ({
            key: String(attempt.id),
            label: (
              <div className="teacher-attempt-collapse-label">
                <Space wrap>
                  <Tag color={stageColors[attempt.stage]}>{attempt.stage_label}</Tag>
                  <Tag color={resultColor(attempt.result)}>{attempt.result_label}</Tag>
                  <Text strong>{attempt.location}</Text>
                </Space>
                <Text type="secondary">{formatTime(attempt.timestamp)}</Text>
              </div>
            ),
            children: <AttemptCard attempt={attempt} showHeader={false} />,
          }))}
        />
      </section>
      <section className="teacher-report-section teacher-timeline-section">
        <Title level={5}>学习过程时间线</Title>
        <Timeline items={task.timeline.map((item) => ({
          color: stageColors[item.stage] || "gray",
          content: (
            <div className="teacher-timeline-entry">
              <Text strong>{item.title}</Text>
              <Text>{item.summary}</Text>
              <Text type="secondary">{item.stage_label} · {formatTime(item.timestamp)}</Text>
            </div>
          ),
        }))} />
      </section>
    </div>
  );
}

function SupportTab({ task }: { task: TaskReport }) {
  return (
    <div className="teacher-support-layout">
      <section className="teacher-report-section">
        <Title level={5}>学习助手介入</Title>
        {task.interventions.length ? task.interventions.map((item) => (
          <article key={item.id} className="teacher-intervention-card">
            <div><Tag color={stageColors[item.stage]}>{item.stage_label}</Tag><Tag>{item.support_label}</Tag><Text type="secondary">{formatTime(item.created_at)}</Text></div>
            <Text strong>{item.trigger_label}：{item.diagnosis}</Text>
            {item.message && <Paragraph>{item.message}</Paragraph>}
            <Text type="secondary">后续表现：{item.outcome_label}</Text>
          </article>
        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本任务暂无学习助手介入记录" />}
      </section>

      <section className="teacher-report-section">
        <Title level={5}>学生与学习助手对话</Title>
        {task.conversations.length ? (
          <div className="teacher-chat-transcript">
            {task.conversations.map((item) => (
              <article key={item.id} className={`teacher-chat-bubble ${item.role}`}>
                <div><Text strong>{item.role === "user" ? "学生" : "学习助手"}</Text><Tag color={stageColors[item.stage]}>{item.stage_label}</Tag></div>
                <Paragraph>{item.content}</Paragraph>
                <Text type="secondary">{formatTime(item.created_at)}</Text>
              </article>
            ))}
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本任务暂无对话记录" />}
      </section>
    </div>
  );
}

export default function TeacherStudentDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<StudentReport>(`/teacher/students/${id}/report`);
      setReport(data);
      setSelectedTaskId((current) => current && data.tasks.some((task) => task.id === current) ? current : data.tasks[0]?.id ?? null);
    } catch {
      message.error("学生学习过程报告加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  const selectedTask = useMemo(
    () => report?.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [report, selectedTaskId],
  );

  const exportData = async (type: "csv" | "json") => {
    try {
      await downloadFile(
        `/teacher/students/${id}/export.${type}`,
        type === "csv" ? `student-${id}-learning-summary.csv` : `student-${id}-research-data.json`,
      );
      message.success(type === "csv" ? "教师摘要已导出" : "完整研究数据包已导出");
    } catch {
      message.error("导出失败");
    }
  };

  if (loading && !report) {
    return <div className="teacher-report-loading"><Spin size="large" /></div>;
  }
  if (!report) return <Empty description="没有找到该学生" />;

  return (
    <div className="teacher-data-page teacher-student-report-page">
      <header className="teacher-data-header">
        <div>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/teacher/students")}>返回学生列表</Button>
          <Title level={3}>{report.student.name || report.student.id} 的学习过程</Title>
          <Text type="secondary">学号 {report.student.id} · 最近活动 {formatTime(report.last_activity)}</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadReport()}>刷新</Button>
          <Button icon={<DownloadOutlined />} onClick={() => void exportData("csv")}>导出教师摘要</Button>
          <Button icon={<DownloadOutlined />} onClick={() => void exportData("json")}>导出完整研究包</Button>
        </Space>
      </header>

      <main className="teacher-data-main teacher-report-main">
        <section className="teacher-student-summary">
          <Statistic title="累计有效学习时间" value={report.total_active_time_label} />
          <div>
            <Text type="secondary">查看任务</Text>
            <Segmented
              block
              value={selectedTaskId ?? undefined}
              onChange={(value) => setSelectedTaskId(Number(value))}
              options={report.tasks.map((task, index) => ({ label: `${index + 1}. ${task.title}`, value: task.id }))}
            />
          </div>
        </section>

        <ProfileSummary title="跨任务学习证据画像" summary={report.course_profile} />

        {selectedTask && (
          <section className="teacher-task-report">
            <div className="teacher-task-report-heading">
              <div>
                <Text className="teacher-data-kicker">任务 {report.tasks.findIndex((task) => task.id === selectedTask.id) + 1}</Text>
                <Title level={3}>{selectedTask.title}</Title>
                <Paragraph>{selectedTask.description}</Paragraph>
              </div>
              <Space>
                <Tag color={selectedTask.a_completed ? "success" : "default"}>积木练习{selectedTask.a_completed ? "已达成" : "未达成"}</Tag>
                <Tag color={selectedTask.c_completed ? "success" : "default"}>代码挑战{selectedTask.c_completed ? "已达成" : "未达成"}</Tag>
              </Space>
            </div>
            <Tabs
              items={[
                { key: "overview", label: "任务概览", children: <OverviewTab task={selectedTask} /> },
                { key: "process", label: "作品与过程", children: <ProcessTab task={selectedTask} /> },
                { key: "support", label: "支持与对话", children: <SupportTab task={selectedTask} /> },
              ]}
            />
          </section>
        )}
      </main>
    </div>
  );
}
