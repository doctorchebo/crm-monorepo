/**
 * Hook for managing authentication state and redirects in client components
 * Checks token validity and redirects to login if expired
 */

"use client";

import { isTokenExpired } from "@/lib/auth/token";
import { deleteCookie, getCookie } from "@/lib/cookies";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAuthProtection() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      const token = getCookie("jwt_token");

      // If no token or token is expired, redirect to login
      if (!token || isTokenExpired(token)) {
        console.log("Token missing or expired, redirecting to login");
        deleteCookie("jwt_token");
        router.push("/sign-in");
        return;
      }
    };

    // Check auth on mount
    checkAuth();

    // Check auth every 30 seconds to catch expiration
    const interval = setInterval(checkAuth, 30000);

    return () => clearInterval(interval);
  }, [router]);
}

/**
 * Alternative hook that returns auth status without redirecting
 * Useful for components that need to conditionally render
 */
export function useAuth() {
  const token = getCookie("jwt_token");
  const isAuthenticated = !!(token && !isTokenExpired(token));

  return {
    isAuthenticated,
    token: isAuthenticated ? token : null,
  };
}
