import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { getAdminEmails } from "@/lib/server/env";

export async function requestUser(): Promise<ChatGPTUser | null> {
  return getChatGPTUser();
}

export function isAdministrator(user: ChatGPTUser): boolean {
  return getAdminEmails().has(user.email.trim().toLowerCase());
}

