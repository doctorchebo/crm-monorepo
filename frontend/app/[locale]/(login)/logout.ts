"use client";

import { clearTeamData } from "@/hooks/use-team";
import { clearUserProfile } from "@/hooks/use-user";
import { TokenManager } from "@/lib/auth/token-manager";

/**
 * Client-side logout function to clean up tokens and cached data
 * Should be called after server-side signOut completes
 */
export function logoutClient() {
  // Clear all tokens (access and refresh) using TokenManager
  TokenManager.clearTokens();

  // Clear SWR cached data
  clearUserProfile();
  clearTeamData();

  console.debug("All tokens and cached data cleared");
}
