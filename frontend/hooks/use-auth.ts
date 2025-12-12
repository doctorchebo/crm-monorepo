/**
 * Hook for managing authentication state and redirects in client components
 * Uses centralized TokenManager for token lifecycle management
 */

"use client";

import { TokenManager } from "@/lib/auth/token-manager";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Hook that redirects to login if user is not authenticated
 * Checks token validity and starts automatic token refresh
 */
export function useAuthProtection() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      // Check if user has valid access token
      if (!TokenManager.isAccessTokenValid()) {
        console.log(
          "[useAuthProtection] No valid access token, redirecting to login"
        );
        TokenManager.clearTokens();
        router.push("/sign-in");
        return;
      }

      // Start automatic refresh checking
      TokenManager.startAutoRefreshCheck();
    };

    // Check auth on mount
    checkAuth();

    return () => {
      // Cleanup on unmount
      TokenManager.stopAutoRefreshCheck();
    };
  }, [router]);
}

/**
 * Alternative hook that returns auth status without redirecting
 * Useful for components that need to conditionally render
 */
export function useAuth() {
  const isAuthenticated = TokenManager.isAccessTokenValid();
  const token = isAuthenticated ? TokenManager.getAccessToken() : null;

  return {
    isAuthenticated,
    token,
    isRefreshTokenValid: TokenManager.isRefreshTokenValid(),
    getAccessTokenTimeRemaining: TokenManager.getAccessTokenTimeRemaining(),
  };
}
