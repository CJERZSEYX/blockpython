import type { Stage } from "../../types";

export const colorMap: Record<string, string> = { blue: "#4361ee", orange: "#ff9f1c", green: "#2ec4b6", purple: "#7209b7" };
export const colorLabelMap: Record<string, string> = { blue: "Control", orange: "Data", green: "I/O", purple: "Text" };

export const stageLabels: Record<Stage, { title: string; description: string }> = {
  P: { title: "Task Breakdown", description: "Click a sub-task below to expand blocks, then click a block to see its Python code." },
  A: { title: "Practice", description: "Build blocks from the Python code below. Submit when done." },
  C: { title: "Challenge", description: "The left side shows a block diagram. Write the corresponding Python code." },
  I: { title: "Interaction", description: "Review today's knowledge with your LLM learning partner." },
};
