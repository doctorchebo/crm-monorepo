"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function getAuthHeaders() {
  const cookieJar = await cookies();
  const jwtToken = cookieJar.get("jwt_token")?.value;
  return {
    "Content-Type": "application/json",
    ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
  };
}

export async function assignChat(chatId: string, assigneeId: number | null) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/chats/${chatId}/assign`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ assigneeId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.message || "Failed to assign chat" };
    }

    revalidatePath("/dashboard/chats");
    return { success: true };
  } catch (error) {
    console.error("Failed to assign chat:", error);
    return { error: "Failed to assign chat" };
  }
}
