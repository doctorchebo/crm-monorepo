"use client";

import { TokenManager } from "@/lib/auth/token-manager";

/**
 * Client-side logout function to clean up tokens
 * Should be called after server-side signOut completes
 */
export function logoutClient() {
  // Clear all tokens (access and refresh) using TokenManager
  TokenManager.clearTokens();
  console.debug("All tokens cleared from cookies");
}
