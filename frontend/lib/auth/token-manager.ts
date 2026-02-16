/**
 * Token Management System
 * Handles access token, refresh token, and automatic token refresh
 *
 * Architecture:
 * - Access tokens: short-lived (1 hour), used for API requests
 * - Refresh tokens: long-lived (7 days), used to get new access tokens
 *
 * CRITICAL: Tokens are stored as HTTP-only cookies by the server for CSRF protection
 * - HTTP-only cookies are NOT readable by JavaScript
 * - But they ARE sent automatically with every request by the browser
 * - JavaScript cannot directly access the token data
 *
 * Token Tracking Strategy:
 * - We store expiration TIMESTAMPS in readable cookies (not HTTP-only)
 * - These timestamps let us know when to refresh without reading the actual token
 * - The /auth/refresh endpoint uses the HTTP-only refresh_token cookie automatically
 * - The response sets new HTTP-only cookies for us
 * - IMPORTANT: Tracking cookies live as long as refresh token (7 days) to ensure
 *   we can always determine token status even after access token expires
 */

import { deleteCookie, getCookie, setCookie } from "@/lib/cookies";

const COOKIE_ACCESS_TOKEN = "jwt_token";
const COOKIE_REFRESH_TOKEN = "jwt_refresh_token";
const COOKIE_ACCESS_EXPIRY_TIME = "jwt_token_expires_at";
const COOKIE_REFRESH_EXPIRY_TIME = "jwt_refresh_token_expires_at";

// Refresh threshold: refresh token 5 minutes before expiration
const REFRESH_THRESHOLD_SECONDS = 300;

// Cookie lifetime for tracking cookies (should match refresh token lifetime)
const TRACKING_COOKIE_LIFETIME_SECONDS = 7 * 24 * 60 * 60; // 7 days

export class TokenManager {
  private static refreshPromise: Promise<boolean> | null = null;
  private static refreshCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Store expiration times when tokens are set
   * Called from login action after receiving tokens from backend
   * The server sets the actual JWT tokens as HTTP-only cookies
   */
  static storeTokenExpirationTime(
    accessTokenExpiresAt: Date,
    refreshTokenExpiresAt: Date,
  ): void {
    // Store expiration timestamps in readable cookies so we can check when to refresh
    // IMPORTANT: Use long lifetime so these cookies persist even after access token expires
    setCookie(
      COOKIE_ACCESS_EXPIRY_TIME,
      accessTokenExpiresAt.toISOString(),
      TRACKING_COOKIE_LIFETIME_SECONDS,
    );
    setCookie(
      COOKIE_REFRESH_EXPIRY_TIME,
      refreshTokenExpiresAt.toISOString(),
      TRACKING_COOKIE_LIFETIME_SECONDS,
    );

    console.debug("[TokenManager] Token expiration times stored", {
      accessExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshExpiresAt: refreshTokenExpiresAt.toISOString(),
    });

    // Start automatic refresh checking
    this.startAutoRefreshCheck();
  }

  /**
   * Get the current access token
   * Note: Returns null because HTTP-only cookies cannot be read by JavaScript
   * The browser sends this cookie automatically with API requests
   */
  static getAccessToken(): string | null {
    // HTTP-only cookies are not readable from JavaScript
    // This method exists for API compatibility but will always return null
    // The actual token is sent by the browser with every request automatically
    return null;
  }

  /**
   * Get the current refresh token
   * Note: Returns null because HTTP-only cookies cannot be read by JavaScript
   */
  static getRefreshToken(): string | null {
    // HTTP-only cookies are not readable from JavaScript
    return null;
  }

  /**
   * Check if access token is still valid by checking expiration timestamp
   * Returns true if the access token exists AND has not expired
   */
  static isAccessTokenValid(): boolean {
    const expiresAtStr = getCookie(COOKIE_ACCESS_EXPIRY_TIME);
    if (!expiresAtStr) {
      return false;
    }

    try {
      const expiresAt = new Date(expiresAtStr);
      const now = new Date();
      return expiresAt > now;
    } catch {
      return false;
    }
  }

  /**
   * Check if refresh token is still valid by checking expiration timestamp
   * Returns true if the refresh token exists AND has not expired
   */
  static isRefreshTokenValid(): boolean {
    const expiresAtStr = getCookie(COOKIE_REFRESH_EXPIRY_TIME);
    if (!expiresAtStr) {
      return false;
    }

    try {
      const expiresAt = new Date(expiresAtStr);
      const now = new Date();
      return expiresAt > now;
    } catch {
      return false;
    }
  }

  /**
   * Check if we have any tracking cookies at all
   * This indicates the user has logged in before (even if tokens are expired)
   */
  static hasTrackingCookies(): boolean {
    const accessExpiry = getCookie(COOKIE_ACCESS_EXPIRY_TIME);
    const refreshExpiry = getCookie(COOKIE_REFRESH_EXPIRY_TIME);
    return !!(accessExpiry || refreshExpiry);
  }

  /**
   * Check if access token is expired (but we know it existed)
   * This is different from isAccessTokenValid - it returns true when:
   * - We have a tracking cookie (user logged in before)
   * - The tracked expiration time has passed
   */
  static isAccessTokenExpired(): boolean {
    const expiresAtStr = getCookie(COOKIE_ACCESS_EXPIRY_TIME);
    if (!expiresAtStr) {
      return false; // No tracking cookie, we don't know
    }

    try {
      const expiresAt = new Date(expiresAtStr);
      const now = new Date();
      return expiresAt <= now;
    } catch {
      return false;
    }
  }

  /**
   * Get remaining time for access token (in seconds)
   */
  static getAccessTokenTimeRemaining(): number {
    const expiresAtStr = getCookie(COOKIE_ACCESS_EXPIRY_TIME);
    if (!expiresAtStr) {
      return 0;
    }

    try {
      const expiresAt = new Date(expiresAtStr);
      const now = new Date();
      const remainingMs = expiresAt.getTime() - now.getTime();
      return Math.max(0, Math.floor(remainingMs / 1000));
    } catch {
      return 0;
    }
  }

  /**
   * Refresh access token using the refresh token (which is sent as HTTP-only cookie)
   * This method ensures only one refresh request happens at a time
   * Returns true if refresh succeeded, false otherwise
   */
  static async refreshAccessToken(): Promise<boolean> {
    // If refresh is already in progress, wait for it
    if (this.refreshPromise) {
      console.debug(
        "[TokenManager] Refresh already in progress, returning existing promise",
      );
      return this.refreshPromise;
    }

    // Create and store the refresh promise
    this.refreshPromise = (async () => {
      try {
        console.debug("[TokenManager] Attempting to refresh access token");

        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

        // Call /auth/refresh
        // The refresh_token HTTP-only cookie is sent automatically by the browser
        // No need to manually attach it
        const response = await fetch(`${baseUrl}/auth/refresh`, {
          method: "POST",
          credentials: "include", // Ensure cookies are sent and received
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error(
            "[TokenManager] Refresh failed with status:",
            response.status,
          );
          if (response.status === 401 || response.status === 403) {
            // Refresh token is invalid or expired - clear everything
            this.clearTokens();
          }
          return false;
        }

        const data = await response.json();
        const newAccessTokenExpiry = data.expiresAt;

        if (!newAccessTokenExpiry) {
          console.error("[TokenManager] No token expiry in refresh response");
          return false;
        }

        // Server sets the new access token as HTTP-only cookie
        // We just need to update our expiration tracking
        const expiresAt = new Date(newAccessTokenExpiry);
        // Keep the tracking cookie alive for the full refresh token lifetime
        setCookie(
          COOKIE_ACCESS_EXPIRY_TIME,
          expiresAt.toISOString(),
          TRACKING_COOKIE_LIFETIME_SECONDS,
        );

        console.debug("[TokenManager] Access token refreshed successfully", {
          newExpiresAt: expiresAt.toISOString(),
        });

        return true;
      } catch (error) {
        console.error("[TokenManager] Token refresh failed:", error);
        return false;
      } finally {
        // Clear the refresh promise
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Clear both tokens from storage
   */
  static clearTokens(): void {
    deleteCookie(COOKIE_ACCESS_TOKEN);
    deleteCookie(COOKIE_REFRESH_TOKEN);
    deleteCookie(COOKIE_ACCESS_EXPIRY_TIME);
    deleteCookie(COOKIE_REFRESH_EXPIRY_TIME);
    this.stopAutoRefreshCheck();

    console.debug("[TokenManager] Tokens cleared");
  }

  /**
   * Start automatic token refresh checking
   * Refreshes token before it expires to prevent interruptions.
   * Idempotent: calling multiple times will NOT create duplicate intervals.
   */
  static startAutoRefreshCheck(): void {
    // Already running — no-op to prevent duplicate intervals
    if (this.refreshCheckInterval) {
      return;
    }

    // Check every 30 seconds if refresh is needed
    this.refreshCheckInterval = setInterval(async () => {
      const timeRemaining = this.getAccessTokenTimeRemaining();

      // If token expires in less than threshold, refresh it
      if (timeRemaining > 0 && timeRemaining <= REFRESH_THRESHOLD_SECONDS) {
        await this.refreshAccessToken();
      }

      // If token is already expired but refresh token is valid, attempt refresh
      if (this.isAccessTokenExpired() && this.isRefreshTokenValid()) {
        const success = await this.refreshAccessToken();
        if (!success) {
          console.warn(
            "[TokenManager] Could not refresh expired token - user may need to re-login",
          );
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop automatic token refresh checking
   */
  static stopAutoRefreshCheck(): void {
    if (this.refreshCheckInterval) {
      clearInterval(this.refreshCheckInterval);
      this.refreshCheckInterval = null;
      console.debug("[TokenManager] Auto-refresh check stopped");
    }
  }
}
