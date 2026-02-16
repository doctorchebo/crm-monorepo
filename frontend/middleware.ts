import { defaultLocale, locales } from "@/i18n";
import { signToken, verifyToken } from "@/lib/auth/session";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedRoutes = "/dashboard";

// Create i18n middleware with locale detection
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeDetection: true,
});

function getPreferredLocale(request: NextRequest): string {
  // 1. Check for user locale preference in cookies (set by language switcher)
  const localeCookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (localeCookie && locales.includes(localeCookie as any)) {
    return localeCookie;
  }

  // 2. Check Accept-Language header from browser
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(",")[0].split("-")[0].toLowerCase();
    if (locales.includes(preferred as any)) {
      return preferred;
    }
  }

  // 3. Fall back to default locale (English)
  return defaultLocale;
}

/**
 * Check if a date string represents an expired timestamp
 */
function isExpired(dateString: string): boolean {
  try {
    const expiresAt = new Date(dateString);
    const now = new Date();
    return expiresAt <= now;
  } catch {
    // If we can't parse, assume not expired (allow the request)
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apply i18n middleware first
  const intlResponse = intlMiddleware(request);
  if (intlResponse) {
    return intlResponse;
  }

  // Extract locale from pathname for further processing
  const pathnameWithoutLocale = pathname.replace(/^\/(en|es)/, "") || "/";
  const isProtectedRoute = pathnameWithoutLocale.startsWith(protectedRoutes);

  // Check for JWT tokens (HTTP-only cookies set by server)
  // Note: Server-side middleware CAN read HTTP-only cookies, but client-side JS cannot
  const accessToken = request.cookies.get("jwt_token")?.value;
  const refreshToken = request.cookies.get("jwt_refresh_token")?.value;
  const sessionCookie = request.cookies.get("session");

  // Also check for client-side expiry tracking cookies
  const accessTokenExpiresAt = request.cookies.get(
    "jwt_token_expires_at",
  )?.value;
  const refreshTokenExpiresAt = request.cookies.get(
    "jwt_refresh_token_expires_at",
  )?.value;

  // Redirect to login if accessing protected route without valid tokens
  if (isProtectedRoute) {
    // If no tokens exist at all, redirect to login
    if (!accessToken && !refreshToken) {
      console.debug("[Middleware] No tokens exist, redirecting to login");
      const response = NextResponse.redirect(new URL("/sign-in", request.url));
      // Clean up any stale cookies
      response.cookies.delete("jwt_token");
      response.cookies.delete("jwt_refresh_token");
      response.cookies.delete("jwt_token_expires_at");
      response.cookies.delete("jwt_refresh_token_expires_at");
      response.cookies.delete("session");
      return response;
    }

    // CRITICAL: Check refresh token expiration
    // Only redirect if we can DEFINITIVELY prove the refresh token is expired
    // If refresh token is still valid, let the request through - client will handle refresh
    if (refreshTokenExpiresAt && isExpired(refreshTokenExpiresAt)) {
      console.debug(
        "[Middleware] Refresh token is EXPIRED, redirecting to login",
      );
      const response = NextResponse.redirect(new URL("/sign-in", request.url));
      // Clear all auth cookies since refresh token is expired
      response.cookies.delete("jwt_token");
      response.cookies.delete("jwt_refresh_token");
      response.cookies.delete("jwt_token_expires_at");
      response.cookies.delete("jwt_refresh_token_expires_at");
      response.cookies.delete("session");
      return response;
    }

    // At this point, either:
    // 1. Refresh token is still valid (access token might be expired but that's OK)
    // 2. We don't have expiration tracking cookies but we have HTTP-only cookies
    // 3. Tracking cookies expired/missing but HTTP-only refresh token might still be valid
    //
    // In ALL cases, let the request through. The AuthContext on the client
    // will attempt token refresh and handle authentication properly.
    // This is the key fix for the "next day" scenario.

    // Log what we're doing for debugging
    if (refreshToken && !refreshTokenExpiresAt) {
      console.debug(
        "[Middleware] Refresh token cookie exists but tracking cookie is missing - allowing request (client will verify)",
      );
    } else if (accessTokenExpiresAt && isExpired(accessTokenExpiresAt)) {
      console.debug(
        "[Middleware] Access token expired but refresh token is valid - allowing request (client will refresh)",
      );
    } else if (!accessTokenExpiresAt && accessToken) {
      console.debug(
        "[Middleware] Token exists but no expiration tracking - allowing request",
      );
    } else {
      console.debug("[Middleware] Tokens appear valid - allowing request");
    }
  }

  let res = NextResponse.next();

  // Refresh session cookie if it exists
  if (sessionCookie && request.method === "GET") {
    try {
      const parsed = await verifyToken(sessionCookie.value);
      const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

      res.cookies.set({
        name: "session",
        value: await signToken({
          ...parsed,
          expires: expiresInOneDay.toISOString(),
        }),
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        expires: expiresInOneDay,
      });
    } catch (error) {
      console.error("[Middleware] Error updating session:", error);
      res.cookies.delete("session");
      if (isProtectedRoute) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.png|sounds/|manifest.json).*)",
  ],
  runtime: "nodejs",
};
