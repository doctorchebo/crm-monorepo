/**
 * API Client for communicating with NestJS backend
 * Handles JWT token attachment, error handling, and request/response transformation
 */

import { getCookie } from "@/lib/cookies";

interface ApiRequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  }

  private async getToken(): Promise<string | null> {
    // Get JWT token from browser cookies
    // This token is issued by the backend and should be used for API authentication
    const token = getCookie("jwt_token");
    if (token) {
      console.debug("JWT token found in cookies");
      return token;
    }
    console.debug("JWT token not found in cookies");
    return null;
  }

  private async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = await this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      console.debug(`Sending request to ${endpoint} with JWT token`);
    } else {
      console.warn(`No JWT token available for request to ${endpoint}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.message || `API Error: ${response.status} ${response.statusText}`
      );
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

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
