import type { Stage } from "../../types";

// Keep the teaching cards visually identical to Blockly's category colours.
export const colorMap: Record<string, string> = { blue: "#4C97FF", orange: "#FF8C1A", green: "#59C059", purple: "#CF63CF" };
export const colorLabelMap: Record<string, string> = { blue: "控制", orange: "数据", green: "I/O", purple: "文本" };

export const stageLabels: Record<Stage, { title: string; description: string }> = {
  P: { title: "任务分解", description: "先看清任务目标和操作步骤，再展开知识点理解积木与Python的对应关系。" },
  A: { title: "开始练习", description: "阅读目标程序，在左侧从空白开始搭积木，然后生成并运行检查结果。" },
  C: { title: "代码挑战", description: "观察左侧完整的只读积木，从空白开始写出含义相同的Python程序。" },
  I: { title: "拓展互动", description: "先说出你的思路，再独立编写拓展程序，并结合真实运行结果与学习伙伴讨论。" },
};
