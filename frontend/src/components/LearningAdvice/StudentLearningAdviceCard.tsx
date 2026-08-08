import { CheckCircleOutlined, CompassOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import type { StudentLearningAdvice } from "../../types";

const { Text } = Typography;

export default function StudentLearningAdviceCard({
  advice,
  updating = false,
  compact = false,
}: {
  advice: StudentLearningAdvice;
  updating?: boolean;
  compact?: boolean;
}) {
  return (
    <section className={`student-learning-advice${compact ? " compact" : ""}`}>
      <div className="student-learning-advice-heading">
        <div>
          <Text strong>本任务学习小结</Text>
          <Text type="secondary">把这三点带到下一步练习中</Text>
        </div>
        {updating && <span className="student-learning-advice-updating">学习记录已更新</span>}
      </div>
      <div className="student-learning-advice-items">
        <div><CheckCircleOutlined /><span><b>已经做到</b>{advice.achieved}</span></div>
        <div><CompassOutlined /><span><b>接着留意</b>{advice.focus}</span></div>
        <div><ThunderboltOutlined /><span><b>现在试试</b>{advice.action}</span></div>
      </div>
    </section>
  );
}
