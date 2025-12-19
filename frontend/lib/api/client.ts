/**
 * API Client for communicating with NestJS backend
 * Handles HTTP-only cookie-based authentication with automatic token refresh
 *
 * Architecture:
 * - HTTP-only cookies are set by server (CSRF protection)
 * - Cookies are sent automatically with every request by the browser
 * - No manual token attachment needed
 * - 401 responses trigger automatic token refresh via /auth/refresh endpoint
 * - Transparent refresh to calling code - retries request with new token
 */

import { TokenManager } from "@/lib/auth/token-manager";

/**
 * Custom API Error class that preserves backend validation errors
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors?: Array<{
    message: string;
    field?: string;
    severity?: string;
  }>;
  public readonly originalError?: unknown;

  constructor(
    message: string,
    statusCode: number,
    errors?: Array<{ message: string; field?: string; severity?: string }>,
    originalError?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
    this.originalError = originalError;
  }

  /**
   * Check if this is a validation error (400 Bad Request)
   */
  isValidationError(): boolean {
    return this.statusCode === 400 && Array.isArray(this.errors);
  }

  /**
   * Get a user-friendly error message including validation details
   */
  getDetailedMessage(): string {
    if (this.errors && this.errors.length > 0) {
      const errorMessages = this.errors.map((e) => e.message).join("; ");
      return `${this.message}: ${errorMessages}`;
    }
    return this.message;
  }
}

interface ApiRequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  }

  /**
   * Handle 401 Unauthorized response
   * Attempts to refresh token and retry the request
   */
  private handleUnauthorized() {
    console.warn("[ApiClient] 401 Unauthorized - clearing auth");
    TokenManager.clearTokens();

    // Redirect to login page if in browser
    if (typeof window !== "undefined") {
      window.location.href = "/sign-in";
    }
  }

  /**
   * Perform HTTP request with automatic cookie handling and refresh
   *
   * Key points:
   * - credentials: "include" ensures HTTP-only cookies are sent and received
   * - No manual Authorization header (cookies handle auth automatically)
   * - 401 triggers automatic refresh via /auth/refresh
   */
  private async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {},
    isRetry: boolean = false
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    console.debug(
      `[ApiClient] Making ${
        options.method || "GET"
      } request to ${endpoint} with credentials: "include"`
    );

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include", // CRITICAL: Send and receive HTTP-only cookies
    });

    console.debug(
      `[ApiClient] ${options.method || "GET"} ${endpoint} - ${response.status}`
    );

    // Handle 401 Unauthorized
    if (response.status === 401) {
      if (isRetry) {
        // Already retried once, give up
        console.error("[ApiClient] Still unauthorized after refresh attempt");
        this.handleUnauthorized();
        throw new Error("Unauthorized: Please log in again");
      }

      console.warn("[ApiClient] Received 401 - attempting to refresh token");

      try {
        // Attempt to refresh token
        // The /auth/refresh endpoint uses the refresh_token HTTP-only cookie automatically
        await TokenManager.refreshAccessToken();

        // Retry request with new token (sent as HTTP-only cookie)
        console.debug("[ApiClient] Retrying request after token refresh");
        return this.request<T>(endpoint, options, true);
      } catch (refreshError) {
        console.error("[ApiClient] Token refresh failed:", refreshError);
        this.handleUnauthorized();
        throw new Error("Unauthorized: Please log in again");
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData.message ||
        `API Error: ${response.status} ${response.statusText}`;

      // Create ApiError with validation errors if present
      throw new ApiError(message, response.status, errorData.errors, errorData);
    }

    // Handle 204 No Content or empty responses
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return {} as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
