import type { MessageInstance } from "antd/es/message/interface";

let messageApi: MessageInstance | null = null;

export function setAppMessageApi(api: MessageInstance | null) {
  messageApi = api;
}

export const appMessage = {
  success: (...args: Parameters<MessageInstance["success"]>) => messageApi?.success(...args),
  error: (...args: Parameters<MessageInstance["error"]>) => messageApi?.error(...args),
  warning: (...args: Parameters<MessageInstance["warning"]>) => messageApi?.warning(...args),
  info: (...args: Parameters<MessageInstance["info"]>) => messageApi?.info(...args),
};
