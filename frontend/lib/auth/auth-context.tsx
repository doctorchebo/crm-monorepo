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

    // Check if refresh token is valid first (based on tracking cookie)
    if (!TokenManager.isRefreshTokenValid()) {
      console.debug(
        "[AuthContext] Refresh token tracking indicates invalid/expired - cannot refresh",
      );
      // However, we should still attempt refresh in case tracking cookie is stale
      // The HTTP-only cookie might still be valid
    }

    try {
      const success = await TokenManager.refreshAccessToken();

      if (success) {
        console.debug("[AuthContext] Token refresh successful");
        setState({
          status: "authenticated",
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
        return true;
      } else {
        console.debug("[AuthContext] Token refresh returned false");
        return false;
      }
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
      // Check token status using tracking cookies
      const isAccessValid = TokenManager.isAccessTokenValid();
      const isRefreshValid = TokenManager.isRefreshTokenValid();
      const hasTrackingCookies = TokenManager.hasTrackingCookies();

      // Case 1: Access token is valid - user is authenticated
      if (isAccessValid) {
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

      // Case 2: Access token expired but refresh token is valid - attempt silent refresh
      // This is the "next day" scenario
      if (isRefreshValid) {
        const success = await attemptSilentRefresh();
        if (success && mounted) {
          setState({
            status: "authenticated",
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
          TokenManager.startAutoRefreshCheck();
          return;
        }
      }

      // Case 3: No tracking cookies at all, but we might have HTTP-only cookies
      // This happens if the tracking cookies were deleted but the actual tokens still exist
      // Attempt a "blind" refresh to see if the server recognizes our HTTP-only refresh token
      if (!hasTrackingCookies) {
        const success = await attemptSilentRefresh();
        if (success && mounted) {
          setState({
            status: "authenticated",
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
          TokenManager.startAutoRefreshCheck();
          return;
        }
      }

      // Case 4: No valid tokens and refresh failed - user needs to log in
      if (mounted) {
        setState({
          status: "unauthenticated",
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
      }
    };

    /**
     * Attempt a silent refresh with the backend
     * Returns true if successful, false otherwise
     */
    const attemptSilentRefresh = async (): Promise<boolean> => {
      try {
        console.debug("[AuthContext] Attempting silent refresh");
        const success = await TokenManager.refreshAccessToken();

        if (success) {
          console.debug("[AuthContext] Silent refresh successful");
          return true;
        }

        console.debug("[AuthContext] Silent refresh failed");
        return false;
      } catch (error) {
        console.error("[AuthContext] Error during silent refresh:", error);
        TokenManager.clearTokens();
        return false;
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
