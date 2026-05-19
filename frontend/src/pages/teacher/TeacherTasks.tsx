import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout, Menu, Button, Card, Typography, Input, message, Space, Modal, Form, Divider, Alert } from "antd";
import { TeamOutlined, FileTextOutlined, RobotOutlined, SettingOutlined, ArrowLeftOutlined, EditOutlined, PlusOutlined, DeleteOutlined, ExperimentOutlined } from "@ant-design/icons";
import { getTaskList } from "../../services/taskService";
import api from "../../services/api";
import { registerCustomBlocks } from "../../components/BlocklyEditor/customBlocks";
import type { Task } from "../../types";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

export default function TeacherTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [runResult, setRunResult] = useState<{ stdout: string; stderr: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [blockPreview, setBlockPreview] = useState<any>(null);
  const [blockXml, setBlockXml] = useState("");
  const [xmlLoading, setXmlLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    try { setTasks(await getTaskList()); } catch {} finally { setLoading(false); }
  };

  const handleEdit = async (task: Task) => {
    try {
      const { data } = await api.get(`/task/${task.id}`);
      const c = data.task.content_json || {} as any;
      setEditingTask(data.task);
      setRunResult(null);
      setBlockPreview(null);
      setBlockXml("");
      setForm({
        title: data.task.title, description: data.task.description,
        a_python_code: c.a_stage?.python_code || "",
        c_title: c.c_stage?.title || "", c_description: c.c_stage?.description || "",
        c_expected_output: c.c_stage?.expected_output || "", c_answer_code: c.c_stage?.answer_code || "",
        i_summary: (c.i_stage?.summary_points || []).join("\n"),
        i_questions: (c.i_stage?.question_prompts || []).join("\n"),
      });
    } catch { message.error("Load failed"); }
  };

  const handleNew = async () => {
    try {
      await api.post("/teacher/tasks", {
        title: "New Task", description: "Edit description", sort_order: tasks.length + 1,
        content_json: { p_stage: { subtasks: [] }, a_stage: { python_code: "" }, c_stage: { title: "", description: "", expected_output: "", answer_code: "" }, i_stage: { summary_points: [], question_prompts: [] } },
      });
      message.success("Created"); loadTasks();
    } catch { message.error("Create failed"); }
  };

  const previewBlocks = async (code: string) => {
    if (!code.trim()) { message.warning("Please enter code first"); return; }
    setPreviewLoading(true);
    try {
      const { data } = await api.post("/teacher/preview-blocks", { code });
      setBlockPreview(data.blocks || {});
    } catch { setBlockPreview(null); } finally { setPreviewLoading(false); }
  };

  const previewBlocksVisual = async (code: string) => {
    if (!code.trim()) return;
    try {
      const { data: runData } = await api.post("/submit/run", { check_type: "code_run", code });
      if (runData.stderr) { message.error(`Code error: ${runData.stderr.substring(0, 80)}`); return; }
    } catch { message.error("Run failed, cannot preview"); return; }

    setXmlLoading(true);
    try {
      const { data } = await api.post("/teacher/preview-blocks-xml", { code });
      setBlockXml(data.xml);
      setTimeout(() => renderBlocklyPreview(data.xml), 300);
    } catch { message.error("Generation failed"); } finally { setXmlLoading(false); }
  };

  const renderBlocklyPreview = async (xml: string) => {
    const container = document.getElementById("blockly-preview-container");
    if (!container || !xml) return;
    container.innerHTML = "";
    const Blockly = await import("blockly");
    registerCustomBlocks();
    const ws = Blockly.inject(container, {
      toolbox: { kind: "flyoutToolbox", contents: [] },
      scrollbars: true, trashcan: false, readOnly: true, sounds: false,
      zoom: { controls: true, wheel: true },
    });
    const dom = Blockly.utils.xml.textToDom(xml);
    Blockly.Xml.domToWorkspace(dom, ws);
  };

  const testRunCode = async (code: string, expectedOutput?: string) => {
    if (!code.trim()) { message.warning("Please enter code first"); return; }
    setRunning(true);
    try {
      const { data } = await api.post("/submit/run", { check_type: "code_run", code, expected_output: expectedOutput || "" });
      setRunResult(data);
    } catch { setRunResult({ stdout: "", stderr: "Run failed" }); }
    finally { setRunning(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const content_json = {
        ...(editingTask!.content_json || {}),
        a_stage: { python_code: form.a_python_code },
        c_stage: { title: form.c_title, description: form.c_description, expected_output: form.c_expected_output, answer_code: form.c_answer_code, code_skeleton: "" },
        i_stage: { summary_points: form.i_summary.split("\n").filter(Boolean), question_prompts: form.i_questions.split("\n").filter(Boolean) },
      };
      await api.put(`/teacher/tasks/${editingTask!.id}`, { title: form.title, description: form.description, content_json });
      await api.post(`/task/infer/${editingTask!.id}`);
      message.success("Saved, answers updated");
      setEditingTask(null);
      loadTasks();
    } catch { message.error("Save failed"); } finally { setSaving(false); }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529", display: "flex", alignItems: "center", padding: "0 24px" }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/teacher")} style={{ color: "#fff" }}>Back</Button>
        <span style={{ color: "#fff", fontSize: 18, marginLeft: 16 }}>Task Management</span>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: "#fafafa" }}>
          <Menu mode="inline" style={{ height: "100%" }} selectedKeys={["/teacher/tasks"]} onClick={({ key }) => navigate(key)}
            items={[
              { key: "/teacher/students", icon: <TeamOutlined />, label: "Student Data" },
              { key: "/teacher/tasks", icon: <FileTextOutlined />, label: "Task Management" },
              { key: "/teacher/prompts", icon: <RobotOutlined />, label: "Prompt Management" },
              { key: "/teacher/settings", icon: <SettingOutlined />, label: "System Settings" },
            ]} />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Space style={{ marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0 }}>Task Management</Title>
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleNew}>New Task</Button>
          </Space>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>After modifying Python code and saving, the system will auto-update correct answers.</Text>
          {tasks.map((task) => (
            <Card key={task.id} loading={loading} style={{ marginBottom: 12 }}
              title={<Input defaultValue={task.title} style={{ width: 400 }} onBlur={async (e) => { await api.put(`/teacher/tasks/${task.id}`, { title: e.target.value }); }} />}
              extra={
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(task)}>Edit</Button>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={async () => {
                    if (!confirm("Are you sure?")) return; await api.delete(`/teacher/tasks/${task.id}`); message.success("Deleted"); loadTasks();
                  }}>Delete</Button>
                </Space>
              }>
              <Text type="secondary">Order {task.sort_order} · {task.description}</Text>
            </Card>
          ))}

          <Modal title={`Edit: ${editingTask?.title || ""}`} open={!!editingTask} onOk={handleSave} onCancel={() => setEditingTask(null)} width={750} okText="Save Changes" confirmLoading={saving}>
            <Form layout="vertical">
              <Form.Item label="Task Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Form.Item>
              <Form.Item label="Task Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></Form.Item>
              <Divider>Stage A — Python Code for Student Blocks</Divider>
              <Form.Item label="Python Code">
                <TextArea value={form.a_python_code} onChange={(e) => setForm({ ...form, a_python_code: e.target.value })} rows={5} style={{ fontFamily: "Consolas, monospace" }} />
              </Form.Item>
              <Space>
                <Button icon={<ExperimentOutlined />} loading={running} onClick={() => testRunCode(form.a_python_code)}>Test Run</Button>
                <Button loading={xmlLoading} onClick={() => blockXml ? setBlockXml("") : previewBlocksVisual(form.a_python_code)}>Visual Preview</Button>
                <Button loading={previewLoading} onClick={() => blockPreview ? setBlockPreview(null) : previewBlocks(form.a_python_code)}>Block List</Button>
              </Space>
              {runResult && (
                <Alert style={{ marginTop: 8 }} type={runResult.stderr ? "error" : "success"}
                  message={runResult.stderr ? `Run Error: ${runResult.stderr.substring(0, 100)}` : `Output: ${runResult.stdout || "(no output)"}`} showIcon />
              )}
              {blockPreview && Object.keys(blockPreview).length > 0 && (
                <Card size="small" title="Block List Preview" style={{ marginTop: 8, background: "#f0f5ff" }}>
                  <Space wrap>
                    {Object.entries(blockPreview).map(([type, spec]: [string, any]) => {
                      const colorMap: Record<string, string> = {
                        controls_if: "#4C97FF", controls_repeat_ext: "#4C97FF", controls_whileUntil: "#4C97FF",
                        variables_set: "#FF8C1A", math_number: "#FF8C1A", math_arithmetic: "#FF8C1A",
                        logic_compare: "#FF8C1A", logic_operation: "#FF8C1A",
                        text_print: "#59C059", sensing_ask: "#59C059",
                        text: "#CF63CF", text_join: "#CF63CF", text_length: "#CF63CF",
                      };
                      const catMap: Record<string, string> = { controls_if: "Control", variables_set: "Data", text_print: "Output", text: "Text" };
                      const cat = Object.keys(catMap).find((k) => type.startsWith(k)) || "";
                      return (
                        <div key={type} style={{ background: colorMap[type] || "#999", color: "#fff", borderRadius: 6, padding: "6px 12px", fontSize: 13, fontWeight: 500, minWidth: 80, textAlign: "center" }}>
                          <div>{type}</div>
                          <div style={{ fontSize: 11, opacity: 0.85 }}>{catMap[cat] || ""} · {spec.count}</div>
                          {spec.fields && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{JSON.stringify(spec.fields).substring(0, 40)}</div>}
                        </div>
                      );
                    })}
                  </Space>
                </Card>
              )}
              {blockXml && (
                <div id="blockly-preview-container" style={{ marginTop: 8, width: "100%", height: 300, border: "1px solid #d9d9d9", borderRadius: 6 }} />
              )}
              {blockPreview && Object.keys(blockPreview).length === 0 && (
                <Alert style={{ marginTop: 8 }} type="warning" message="Cannot infer blocks, please check code" />
              )}
              <Divider>Stage C — Code Writing Challenge</Divider>
              <Form.Item label="Title"><Input value={form.c_title} onChange={(e) => setForm({ ...form, c_title: e.target.value })} /></Form.Item>
              <Form.Item label="Task Description"><TextArea value={form.c_description} onChange={(e) => setForm({ ...form, c_description: e.target.value })} rows={2} /></Form.Item>
              <Form.Item label="Expected Output"><Input value={form.c_expected_output} onChange={(e) => setForm({ ...form, c_expected_output: e.target.value })} /></Form.Item>
              <Form.Item label="Answer Code (for block preview + answer validation)">
                <TextArea value={form.c_answer_code} onChange={(e) => setForm({ ...form, c_answer_code: e.target.value })} rows={5} style={{ fontFamily: "Consolas, monospace" }} />
              </Form.Item>
              <Space>
                <Button icon={<ExperimentOutlined />} loading={running} onClick={() => testRunCode(form.c_answer_code, form.c_expected_output)}>Test Run</Button>
              </Space>
              {runResult && (
                <Alert style={{ marginTop: 12 }} type={runResult.stderr ? "error" : "success"}
                  message={runResult.stderr ? "Run Error" : `Output: ${runResult.stdout || "(no output)"}`}
                  description={runResult.stderr} showIcon />
              )}
              <Divider>Stage I — Discussion</Divider>
              <Form.Item label="Key Points (one per line)"><TextArea value={form.i_summary} onChange={(e) => setForm({ ...form, i_summary: e.target.value })} rows={3} /></Form.Item>
              <Form.Item label="Discussion Questions (one per line)"><TextArea value={form.i_questions} onChange={(e) => setForm({ ...form, i_questions: e.target.value })} rows={3} /></Form.Item>
            </Form>
          </Modal>
        </Content>
      </Layout>
    </Layout>
  );
}
