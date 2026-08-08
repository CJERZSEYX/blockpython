import { EyeOutlined, FlagOutlined } from "@ant-design/icons";
import type { LearningGuide as LearningGuideData, Stage } from "../../types";

interface LearningGuideProps {
  guide?: LearningGuideData;
  stage: Extract<Stage, "P" | "A" | "C">;
}

export default function LearningGuide({ guide, stage }: LearningGuideProps) {
  if (!guide) return null;

  if (stage === "P") {
    return (
      <section className="learning-guide learning-guide-p stage-task-brief stage-task-window">
        <div className="learning-guide-overview">
          <div className="learning-guide-overview-icon"><FlagOutlined /></div>
          <div>
            <span className="learning-guide-label">本次任务</span>
            <strong>{guide.goal}</strong>
            <div className="learning-guide-effect">
              <EyeOutlined />
              <span>
                <b>运行后会看到：</b>
                {guide.expected_effect || guide.observe}
              </span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const stageLead = stage === "A"
    ? "搭积木时按这几步检查"
    : stage === "C"
      ? "写代码时按这几步检查"
      : "";

  return (
    <section className={`learning-guide learning-guide-${stage.toLowerCase()} stage-task-brief`}>
      <div className="learning-guide-goal">
        <FlagOutlined />
        <div>
          <span className="learning-guide-label">本次目标</span>
          <strong>{guide.goal}</strong>
        </div>
      </div>

      <div className="learning-guide-section">
        <span className="learning-guide-label">{stageLead}</span>
        <ol className="learning-guide-steps">
          {guide.steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="learning-guide-observe">
        <EyeOutlined />
        <span>{guide.observe}</span>
      </div>

      <div className="learning-guide-concepts" aria-label="本任务知识点">
        {guide.concepts.map((concept) => <span key={concept}>{concept}</span>)}
      </div>
    </section>
  );
}
