import api from "./api";
import type { ChatMessage } from "../types";

export const sendChatMessage = async (
  messages: Omit<ChatMessage, "timestamp">[],
  stage: string
) => {
  const { data } = await api.post("/chat/send", { messages, stage });
  return data;
};
