"use client";

import { ReactNode, useEffect } from "react";
import { TokenManager } from "./token-manager";

/**
 * Token Provider Component
 *
 * This component initializes TokenManager on app startup and ensures:
 * 1. Auto-refresh checking starts if tokens are already in cookies (e.g., after page refresh)
 * 2. TokenManager is bootstrapped before any API requests are made
 * 3. Auto-refresh begins for authenticated sessions
 *
 * NOTE: Tokens are stored as HTTP-only cookies by the server (for CSRF protection).
 * JavaScript cannot read HTTP-only cookies, but we know they exist when:
 * - User just logged in (page redirect from login happens with cookies set)
 * - User refreshed the page and has valid session
 *
 * So we start auto-refresh check which will:
 * 1. Call /auth/refresh endpoint with refresh token (sent as HTTP-only cookie)
 * 2. Get new access token (also sent as HTTP-only cookie)
 * 3. All API requests automatically include these cookies
 */
export function TokenProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize TokenManager on app startup
    console.debug("[TokenProvider] Initializing TokenManager on app startup");

    // On page load/refresh, sync token expiration times from backend
    // This ensures expiration tracking cookies are set correctly
    const syncTokenExpiration = async () => {
      try {
        console.debug("[TokenProvider] Syncing token expiration from backend");
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

        // Call refresh to get new token and expiration times
        // This also renews the access token to ensure it's fresh
        const response = await fetch(`${baseUrl}/auth/refresh`, {
          method: "POST",
          credentials: "include", // Send refresh_token cookie
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.expiresAt) {
            // Store the new expiration time in tracking cookies
            const expiresAt = new Date(data.expiresAt);
            TokenManager.storeTokenExpirationTime(
              expiresAt,
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            );
            console.debug(
              "[TokenProvider] Token expiration synced successfully",
              { expiresAt: expiresAt.toISOString() }
            );
            return true; // Successfully authenticated
          }
        } else if (response.status === 401 || response.status === 403) {
          // Refresh failed - user is not authenticated
          // This is normal on public pages, don't redirect
          console.debug(
            "[TokenProvider] User not authenticated (no valid session)"
          );
          return false;
        } else {
          // Other error - log but don't redirect
          console.warn(
            "[TokenProvider] Token refresh failed:",
            response.status,
            response.statusText
          );
          return false;
        }
      } catch (error) {
        console.debug(
          "[TokenProvider] Network error during token sync (normal on first load):",
          error
        );
        // Network errors are normal - tokens might not be set yet
        return false;
      }
    };

    // Sync token expiration on app startup and only start auto-refresh if authenticated
    (async () => {
      const isAuthenticated = await syncTokenExpiration();

      if (isAuthenticated) {
        // Only start auto-refresh if we confirmed the user is authenticated
        console.debug(
          "[TokenProvider] User authenticated, starting auto-refresh"
        );
        TokenManager.startAutoRefreshCheck();
      } else {
        console.debug(
          "[TokenProvider] User not authenticated, skipping auto-refresh"
        );
      }
    })();

    // Cleanup when component unmounts
    return () => {
      // Don't stop auto-refresh on unmount - it should persist during the session
      // Only stop when user explicitly logs out (handled in logout action)
    };
  }, []);

  return <>{children}</>;
}
