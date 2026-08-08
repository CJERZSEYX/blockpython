import type { ExecutionResult } from "../types";

export interface FriendlyFeedback {
  title: string;
  description?: string;
}

function friendlyPythonError(stderr: string, line: number | null): string {
  const prefix = line ? `请检查第 ${line} 行：` : "";
  if (/invalid character ['"]?[“”‘’]/i.test(stderr)) {
    return `${prefix}使用了中文引号。Python中的文字需要使用英文引号 " 或 '。`;
  }
  if (/was never closed|unexpected EOF|unterminated string|EOL while scanning/i.test(stderr)) {
    return `${prefix}括号或引号没有成对出现，请检查是否缺少右括号或结束引号。`;
  }
  if (/expected ':'/i.test(stderr)) {
    return `${prefix}这一行末尾缺少英文冒号 :。`;
  }
  if (/expected an indented block|unexpected indent|unindent does not match/i.test(stderr)) {
    return `${prefix}缩进位置不正确。属于条件或循环的代码要向右缩进，并保持对齐。`;
  }
  const undefinedName = stderr.match(/name ['"]([^'"]+)['"] is not defined/i);
  if (undefinedName) {
    return `${prefix}变量 ${undefinedName[1]} 还没有设置值，请检查变量名和赋值顺序。`;
  }
  if (/unsupported|不支持|只能使用/i.test(stderr)) {
    return `${prefix}当前代码使用了本课程暂不支持的语法或函数。`;
  }
  return `${prefix}代码还不能运行。请先检查括号、英文引号、冒号和缩进。`;
}

export function getFriendlyFeedback(result: ExecutionResult): FriendlyFeedback {
  const diagnostic = result.diagnostics?.[0]?.message;
  switch (result.status) {
    case "invalid_structure":
      return {
        title: "积木还没有搭完整",
        description: diagnostic || "请检查工作区是否为空，以及积木的输入槽和上下连接。",
      };
    case "syntax_error":
      return {
        title: "代码还不能运行",
        description: friendlyPythonError(result.stderr || "", result.line),
      };
    case "runtime_error":
      return {
        title: "程序运行到这里遇到了问题",
        description: friendlyPythonError(result.stderr || "", result.line),
      };
    case "target_mismatch":
      return {
        title: "程序可以运行，但还没有达到任务目标",
        description: "对照任务目标，检查输出内容与顺序、变量变化或条件判断中哪一项还不一致。",
      };
    case "target_met":
      return {
        title: "这次运行符合任务目标",
        description: "观察代码的执行顺序和画面反馈是怎样一一对应的。",
      };
    case "timeout":
      return {
        title: "程序运行时间太长",
        description: "请检查循环次数是否过大，或程序是否一直重复执行。",
      };
  }
}
