import { Alert, Typography } from "antd";
import type { ExecutionResult, VisualizationConfig, VisualizationType } from "../../types";
import { getFriendlyFeedback } from "../../utils/executionFeedback";
import DirectProgramStage from "../PixelStage/DirectProgramStage";

const { Text } = Typography;

interface ExecutionVisualizerProps {
  type: VisualizationType;
  result: ExecutionResult | null;
  input?: string;
  allowMismatch?: boolean;
  visualization?: VisualizationConfig;
  onPlaybackComplete?: () => void;
  idleMessage?: string;
}

export default function ExecutionVisualizer(props: ExecutionVisualizerProps) {
  if (props.type === "variable_map") {
    return (
      <DirectProgramStage
        visualization={props.visualization || { type: "variable_map" }}
        result={props.result}
        input={props.input}
        onPlaybackComplete={props.onPlaybackComplete}
        idleMessage={props.idleMessage}
      />
    );
  }
  const feedback = props.result ? getFriendlyFeedback(props.result) : null;
  return (
    <section className="execution-visualizer visual-console-only">
      <header className="execution-visualizer-header">
        <div><span className="code-status-dot" /><Text strong>程序状态</Text></div>
      </header>
      <div className="execution-visualizer-body">
        <div className="visual-console">
          {props.result?.stdout
            ? props.result.stdout.trimEnd().split("\n").map((line, index) => (
              <div key={`${line}-${index}`}><span>{index + 1}</span>{line}</div>
            ))
            : <Text type="secondary">运行后，print()的内容会依次显示在这里。</Text>}
        </div>
      </div>
      {props.result && feedback && (
        <Alert
          className="execution-conclusion"
          type={props.result.status === "target_met" ? "success" : props.result.status === "target_mismatch" ? "warning" : "error"}
          title={feedback.title}
          description={feedback.description}
          showIcon
        />
      )}
    </section>
  );
}
