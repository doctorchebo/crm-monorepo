"use client";

import { deleteCookie } from "@/lib/cookies";

/**
 * Client-side logout function to clean up JWT token
 * Should be called after server-side signOut completes
 */
export function logoutClient() {
  // Delete JWT token from browser cookies
  deleteCookie("jwt_token");
  console.debug("JWT token deleted from cookies");
}
