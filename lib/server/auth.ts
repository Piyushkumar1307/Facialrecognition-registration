import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";

export async function requestUser(): Promise<ChatGPTUser | null> {
  return getChatGPTUser();
}

