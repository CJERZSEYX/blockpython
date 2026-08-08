const taskQuestions: Record<number, string> = {
  1: "拓展任务要增加第四句话，你准备把它放在原来三句话的什么位置？",
  2: "这次要让同一个步数变量控制多段移动，你准备先计算哪一段？",
  3: "面对新的输入选择，你准备怎样让两个分支分别改变位置？",
  4: "这次需要多次往返，你准备怎样确定循环次数？",
  5: "每轮都要重新判断条件，你准备在循环中的哪个位置进行判断？",
  6: "三段路线需要依次衔接，你准备先规划前往、返回还是再次前往？",
};

function attemptStatus(attempt: Record<string, any>) {
  switch (attempt?.result) {
    case "target_met": return "你在前面的任务中已经让程序达到目标";
    case "syntax_error": return "你最近一次在Python书写上遇到了问题";
    case "runtime_error": return "你最近一次程序在运行中遇到了问题";
    case "target_mismatch": return "你最近一次程序能够运行，但结果还需要调整";
    case "invalid_structure": return "你最近一次积木结构还需要补充";
    default: return "我们先把前面的思路用到这次拓展任务中";
  }
}

export function latestRelevantAttempt(packet: any): Record<string, any> | null {
  const direct = packet?.previous_stage_summary?.latest_relevant_attempt;
  if (direct && typeof direct === "object") return direct;
  const attempts = packet?.previous_stage_summary?.attempts;
  return Array.isArray(attempts) ? attempts.at(-1) || null : null;
}

export function buildCollaborationOpening(packet: any): string {
  const taskId = Number(packet?.task_and_stage?.task_id || 0);
  const latest = latestRelevantAttempt(packet);
  const opening = latest ? attemptStatus(latest) : "我们先把前面学到的方法用到这次拓展任务中";
  return `${opening}。${taskQuestions[taskId] || "你准备先完成哪一步？"}`;
}

export function collaborationReplyViolation(reply: string): string | null {
  if (/共有\s*\d+\s*次|运行流水|逐次运行|运行记录如下/.test(reply)) return "attempt_count";
  const enumerated = [...reply.matchAll(/第(?:[一二三四五六七八九十]|\d+)次(?:运行|尝试|[PAC]阶段)/g)];
  if (enumerated.length >= 2) return "attempt_enumeration";
  const questions = (reply.match(/[？?]/g) || []).length;
  if (questions > 1) return "multiple_questions";
  if (/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/i.test(reply)) return "internal_term";
  if (reply.length > 180) return "too_long";
  return null;
}
