/**
 * Authentication Hooks
 *
 * This module provides React hooks for managing authentication state
 * in client components. It uses the centralized AuthContext for state
 * management and TokenManager for token lifecycle operations.
 *
 * Key features:
 * - Automatic token refresh when access token is expired but refresh token is valid
 * - Protection for authenticated routes with automatic redirects
 * - Non-blocking auth status checks for conditional rendering
 */

"use client";

import { useAuthContext, useIsAuthenticated } from "@/lib/auth/auth-context";
import { TokenManager } from "@/lib/auth/token-manager";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Hook that protects a route and redirects to login if not authenticated.
 *
 * IMPORTANT: This hook properly handles the "next day" scenario where:
 * - Access token has expired (1 hour lifetime)
 * - Refresh token is still valid (7 day lifetime)
 *
 * In this case, it will:
 * 1. Wait for the AuthContext to finish its initial check (which includes silent refresh)
 * 2. Only redirect if authentication ultimately fails
 *
 * This prevents the flash redirect when returning the next day with a valid refresh token.
 */
export function useAuthProtection() {
  const router = useRouter();
  const { status, isLoading, isAuthenticated } = useAuthContext();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Don't do anything while loading - AuthContext is checking/refreshing tokens
    if (isLoading || status === "loading") {
      console.debug(
        "[useAuthProtection] Waiting for auth check to complete...",
      );
      return;
    }

    // Only redirect once to prevent multiple redirects
    if (!isAuthenticated && !hasRedirected.current) {
      hasRedirected.current = true;
      console.log(
        "[useAuthProtection] User not authenticated after auth check, redirecting to login",
      );
      router.push("/sign-in");
      return;
    }

    // User is authenticated - ensure auto-refresh is running
    if (isAuthenticated) {
      console.debug(
        "[useAuthProtection] User authenticated, starting auto-refresh",
      );
      TokenManager.startAutoRefreshCheck();
    }

    return () => {
      // Don't stop auto-refresh on unmount - it should persist during the session
      // This is handled by logout action
    };
  }, [status, isLoading, isAuthenticated, router]);

  // Return loading state so components can show a loading indicator
  return { isLoading: isLoading || status === "loading" };
}

/**
 * Hook that returns auth status without redirecting.
 * Useful for components that need to conditionally render based on auth state.
 *
 * This hook properly reflects the current authentication state including
 * any pending refresh operations.
 */
export function useAuth() {
  const { isLoading, isAuthenticated, refreshAuth, signOut } = useAuthContext();

  return {
    /** Whether auth check is in progress (including silent refresh) */
    isLoading,
    /** Whether user is currently authenticated */
    isAuthenticated,
    /** Token getter (always null for HTTP-only cookies, but kept for API compatibility) */
    token: null,
    /** Whether refresh token is valid (can be used to show "session expired" vs "please login") */
    isRefreshTokenValid: TokenManager.isRefreshTokenValid(),
    /** Remaining time on access token in seconds */
    getAccessTokenTimeRemaining: TokenManager.getAccessTokenTimeRemaining(),
    /** Manually trigger a token refresh */
    refreshAuth,
    /** Sign out and clear all tokens */
    signOut,
  };
}

/**
 * Hook specifically for checking if user is authenticated.
 * Lightweight version that only returns loading and authenticated states.
 */
export { useIsAuthenticated };
