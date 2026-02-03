"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TokenManager } from "./token-manager";

/**
 * Authentication State Types
 */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  /** Current authentication status */
  status: AuthStatus;
  /** Whether the auth check is in progress */
  isLoading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Error message if authentication failed */
  error: string | null;
}

interface AuthContextValue extends AuthState {
  /**
   * Manually trigger a token refresh
   * Returns true if successful, false otherwise
   */
  refreshAuth: () => Promise<boolean>;
  /**
   * Sign out the user and clear all tokens
   */
  signOut: () => void;
  /**
   * Ensure the user is authenticated, refreshing if necessary
   * Returns true if authenticated (or successfully refreshed), false otherwise
   */
  ensureAuthenticated: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Authentication Provider
 *
 * This provider manages the authentication state for the entire application.
 * It handles:
 * - Initial authentication check on mount
 * - Automatic token refresh when access token is expired but refresh token is valid
 * - Providing authentication state to child components
 *
 * The key insight is that we need to check BOTH access and refresh tokens:
 * 1. If access token is valid -> authenticated
 * 2. If access token is expired but refresh token is valid -> attempt refresh
 * 3. If both are expired/invalid -> unauthenticated
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  /**
   * Attempt to refresh the access token
   * Returns true if successful, false otherwise
   */
  const refreshAuth = useCallback(async (): Promise<boolean> => {
    console.debug("[AuthContext] Attempting to refresh authentication");

    // Check if refresh token is valid first
    if (!TokenManager.isRefreshTokenValid()) {
      console.debug("[AuthContext] Refresh token is not valid, cannot refresh");
      return false;
    }

    try {
      await TokenManager.refreshAccessToken();
      console.debug("[AuthContext] Token refresh successful");

      setState({
        status: "authenticated",
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });

      return true;
    } catch (error) {
      console.error("[AuthContext] Token refresh failed:", error);
      return false;
    }
  }, []);

  /**
   * Sign out the user
   */
  const signOut = useCallback(() => {
    console.debug("[AuthContext] Signing out user");
    TokenManager.clearTokens();
    setState({
      status: "unauthenticated",
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });
  }, []);

  /**
   * Ensure user is authenticated, refreshing tokens if necessary
   * This is the key method that handles the "next day" scenario
   */
  const ensureAuthenticated = useCallback(async (): Promise<boolean> => {
    console.debug("[AuthContext] Ensuring authentication...");

    // Case 1: Access token is still valid
    if (TokenManager.isAccessTokenValid()) {
      console.debug("[AuthContext] Access token is valid");
      setState({
        status: "authenticated",
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
      return true;
    }

    // Case 2: Access token expired, but refresh token is valid
    if (TokenManager.isRefreshTokenValid()) {
      console.debug(
        "[AuthContext] Access token expired, attempting refresh with valid refresh token",
      );

      const refreshed = await refreshAuth();
      if (refreshed) {
        return true;
      }
    }

    // Case 3: Both tokens expired or refresh failed
    console.debug(
      "[AuthContext] Authentication failed - no valid tokens or refresh failed",
    );
    setState({
      status: "unauthenticated",
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });

    return false;
  }, [refreshAuth]);

  /**
   * Initial authentication check on mount
   */
  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      console.debug("[AuthContext] Starting initial authentication check");

      // First check if we have any expiration tracking cookies
      // If not, we might need to sync from backend
      const hasAccessExpiry = TokenManager.isAccessTokenValid();
      const hasRefreshExpiry = TokenManager.isRefreshTokenValid();

      console.debug("[AuthContext] Token status:", {
        accessTokenValid: hasAccessExpiry,
        refreshTokenValid: hasRefreshExpiry,
      });

      if (hasAccessExpiry) {
        // Access token is valid
        if (mounted) {
          setState({
            status: "authenticated",
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
          // Start auto-refresh
          TokenManager.startAutoRefreshCheck();
        }
        return;
      }

      if (hasRefreshExpiry) {
        // Access token expired but refresh token is valid
        // This is the "next day" scenario - attempt silent refresh
        console.debug(
          "[AuthContext] Access token expired but refresh token valid - attempting silent refresh",
        );

        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

          const response = await fetch(`${baseUrl}/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.expiresAt) {
              const expiresAt = new Date(data.expiresAt);
              // Store new expiration time
              TokenManager.storeTokenExpirationTime(
                expiresAt,
                new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              );

              if (mounted) {
                setState({
                  status: "authenticated",
                  isLoading: false,
                  isAuthenticated: true,
                  error: null,
                });
                // Start auto-refresh
                TokenManager.startAutoRefreshCheck();
              }
              return;
            }
          }

          // Refresh failed - user needs to log in again
          console.debug(
            "[AuthContext] Refresh failed with status:",
            response.status,
          );
          TokenManager.clearTokens();
        } catch (error) {
          console.error("[AuthContext] Error during refresh:", error);
          TokenManager.clearTokens();
        }
      }

      // No valid tokens
      if (mounted) {
        setState({
          status: "unauthenticated",
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
      }
    };

    checkAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refreshAuth,
      signOut,
      ensureAuthenticated,
    }),
    [state, refreshAuth, signOut, ensureAuthenticated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication context
 * @throws Error if used outside of AuthProvider
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

/**
 * Hook to check if current user is authenticated
 * Returns loading state and authentication status
 */
export function useIsAuthenticated(): {
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const { isLoading, isAuthenticated } = useAuthContext();
  return { isLoading, isAuthenticated };
}
