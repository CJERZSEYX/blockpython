import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout, Menu, Button, Card, Typography, Input, message, Tabs, Space } from "antd";
import { TeamOutlined, FileTextOutlined, RobotOutlined, ArrowLeftOutlined, SaveOutlined, ExperimentOutlined, SettingOutlined } from "@ant-design/icons";
import api from "../../services/api";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const stageNames: Record<string, string> = {
  P: "Stage P - Lecturer", A: "Stage A - Tutor", C: "Stage C - Assistant", I: "Stage I - Study Partner",
};

export default function TeacherPrompts() {
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStage, setTestStage] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState("");
  const [activeTab, setActiveTab] = useState("stage");
  const [testing, setTesting] = useState(false);
  const [blockNames, setBlockNames] = useState("");
  const [namesUnsaved, setNamesUnsaved] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadPrompts(); }, []);

  const loadPrompts = async () => {
    try {
      const { data } = await api.get("/teacher/prompts");
      setPrompts(data.prompts);
      const { data: sn } = await api.get("/teacher/system-prompts").catch(() => ({ data: { blockNames: "" } }));
      setBlockNames(sn.blockNames || "");
    } catch {} finally { setLoading(false); }
  };

  const handleSave = async (stage: string) => {
    setSaving(true);
    try { await api.put("/teacher/prompts", { stage, content: prompts[stage] }); message.success("Saved"); } catch { message.error("Save failed"); } finally { setSaving(false); }
  };

  const saveNames = async () => {
    try { await api.put("/teacher/system-prompts/names", { content: blockNames }); setNamesUnsaved(false); message.success("Block name index saved"); } catch { message.error("Save failed"); }
  };

  const handleTest = async () => {
    if (!testStage || !testInput.trim()) return;
    setTesting(true);
    try {
      const { data } = await api.post("/teacher/prompts/test", { stage: testStage, message: testInput });
      setTestResult(data?.choices?.[0]?.message?.content || "No response");
    } catch { setTestResult("Test failed"); } finally { setTesting(false); }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529", display: "flex", alignItems: "center", padding: "0 24px" }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/teacher")} style={{ color: "#fff" }}>Back</Button>
        <span style={{ color: "#fff", fontSize: 18, marginLeft: 16 }}>Teacher Admin</span>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: "#fafafa" }}>
          <Menu mode="inline" style={{ height: "100%" }} selectedKeys={["/teacher/prompts"]} onClick={({ key }) => navigate(key)}
            items={[
              { key: "/teacher/students", icon: <TeamOutlined />, label: "Student Data" },
              { key: "/teacher/tasks", icon: <FileTextOutlined />, label: "Task Management" },
              { key: "/teacher/prompts", icon: <RobotOutlined />, label: "Prompt Management" },
              { key: "/teacher/settings", icon: <SettingOutlined />, label: "System Settings" },
            ]} />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Title level={4}>Prompt Management</Title>

          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            { key: "stage", label: "Stage Prompts",
              children: (
                <Tabs tabPosition="left" items={Object.keys(stageNames).map((stage) => ({
                  key: stage, label: stageNames[stage],
                  children: (
                    <Card loading={loading}>
                      <TextArea value={prompts[stage] || ""} onChange={(e) => setPrompts({ ...prompts, [stage]: e.target.value })}
                        rows={10} style={{ fontFamily: "monospace", fontSize: 13 }} />
                      <Space style={{ marginTop: 12 }}>
                        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave(stage)}>Save</Button>
                        <Button icon={<ExperimentOutlined />} onClick={() => { setTestStage(stage); setTestResult(""); setActiveTab("test"); }}>Test</Button>
                        <Button danger onClick={() => {
                          const defaults: Record<string, string> = {
                            P: "Programming teacher. Break down Python into blocks for explanation. Reply with 3-5 sentences each time. Mark with [block name]. Do not answer irrelevant questions.",
                            A: "Programming tutor. Students look at Python and build blocks. Give direction, not answers. Reply with 2-3 sentences each time. Do not answer irrelevant questions.",
                            C: "Programming assistant. Students look at blocks and write code. Only respond when asked. **Never give code** — no snippets, pseudocode, or examples. Reply with 1-2 sentences each time.",
                            I: "Study partner. Peer tone. First summarize key points of this task (2-3 sentences), then ask the student a question (1 sentence). Then free discussion. Reply with 3-4 sentences each time.",
                          };
                          setPrompts({ ...prompts, [stage]: defaults[stage] || "" });
                          message.info("Restored to default, please click save");
                        }}>Restore Defaults</Button>
                      </Space>
                    </Card>
                  ),
                }))} />
              ),
            },
            { key: "test", label: "Prompt Test",
              children: (
                <Card>
                  <Text strong>Select a stage and enter a test message to preview LLM responses</Text>
                  <Tabs activeKey={testStage} onChange={setTestStage} items={Object.entries(stageNames).map(([k, v]) => ({ key: k, label: v }))} style={{ marginTop: 8 }} />
                  {testStage && (<>
                    <TextArea value={testInput} onChange={(e) => setTestInput(e.target.value)} rows={3}
                      placeholder={`As ${stageNames[testStage]}, simulate a possible student question...`} style={{ marginTop: 12 }} />
                    <Button type="primary" icon={<ExperimentOutlined />} loading={testing} onClick={handleTest} style={{ marginTop: 8 }}>Send Test</Button>
                    {testResult && (
                      <Card style={{ marginTop: 12, background: "#f6f8fa" }} title="LLM Response Preview" size="small">
                        <Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>{testResult}</Paragraph>
                      </Card>
                    )}
                  </>)}
                </Card>
              ),
            },
            { key: "names", label: "Block Name Index",
              children: (
                <Card>
                  <Text strong>Block Name Reference</Text>
                  <Paragraph type="secondary">Tell the LLM what name each block code maps to. Changes will apply to all stage LLM responses.</Paragraph>
                  <TextArea value={blockNames} onChange={(e) => { setBlockNames(e.target.value); setNamesUnsaved(true); }}
                    rows={14} style={{ fontFamily: "monospace", fontSize: 13, marginTop: 8 }} />
                  <Button type="primary" icon={<SaveOutlined />} onClick={saveNames} style={{ marginTop: 8 }} disabled={!namesUnsaved}>Save</Button>
                  <Button danger style={{ marginTop: 8, marginLeft: 8 }} onClick={() => {
                    api.get("/teacher/system-prompts/defaults").then(({ data }) => {
                      setBlockNames(data.defaultNames || "");
                      setNamesUnsaved(true);
                      message.info("Restored to default, please click save");
                    });
                  }}>Restore Defaults</Button>
                </Card>
              ),
            },
          ]} />
        </Content>
      </Layout>
    </Layout>
  );
}
