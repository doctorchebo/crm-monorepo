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

  // Extract locale from pathname for further processing
  const pathnameWithoutLocale = pathname.replace(/^\/(en|es)/, "") || "/";
  const isProtectedRoute = pathnameWithoutLocale.startsWith(protectedRoutes);

  // ── Auth checks MUST run before intlMiddleware ──
  // intlMiddleware always returns a NextResponse, so any code after it is unreachable.
  // We perform auth checks first and only redirect when definitively unauthenticated.

  if (isProtectedRoute) {
    // Check for JWT tokens (HTTP-only cookies set by server)
    const accessToken = request.cookies.get("jwt_token")?.value;
    const refreshToken = request.cookies.get("jwt_refresh_token")?.value;

    // Also check for client-side expiry tracking cookies
    const refreshTokenExpiresAt = request.cookies.get(
      "jwt_refresh_token_expires_at",
    )?.value;
    const accessTokenExpiresAt = request.cookies.get(
      "jwt_token_expires_at",
    )?.value;

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

    // Only redirect if we can DEFINITIVELY prove the refresh token is expired
    if (refreshTokenExpiresAt && isExpired(refreshTokenExpiresAt)) {
      console.debug(
        "[Middleware] Refresh token is EXPIRED, redirecting to login",
      );
      const response = NextResponse.redirect(new URL("/sign-in", request.url));
      response.cookies.delete("jwt_token");
      response.cookies.delete("jwt_refresh_token");
      response.cookies.delete("jwt_token_expires_at");
      response.cookies.delete("jwt_refresh_token_expires_at");
      response.cookies.delete("session");
      return response;
    }

    // Log what we're allowing through for debugging
    if (refreshToken && !refreshTokenExpiresAt) {
      console.debug(
        "[Middleware] Refresh token cookie exists but tracking cookie is missing - allowing request",
      );
    } else if (accessTokenExpiresAt && isExpired(accessTokenExpiresAt)) {
      console.debug(
        "[Middleware] Access token expired but refresh token is valid - allowing request (client will refresh)",
      );
    } else {
      console.debug("[Middleware] Tokens appear valid - allowing request");
    }
  }

  // ── Session cookie refresh ──
  const sessionCookie = request.cookies.get("session");
  if (sessionCookie && request.method === "GET") {
    try {
      const parsed = await verifyToken(sessionCookie.value);
      const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Apply i18n middleware and add session cookie refresh to its response
      const intlResponse = intlMiddleware(request);
      if (intlResponse) {
        intlResponse.cookies.set({
          name: "session",
          value: await signToken({
            ...parsed,
            expires: expiresInOneDay.toISOString(),
          }),
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          expires: expiresInOneDay,
        });
        return intlResponse;
      }
    } catch (error) {
      console.error("[Middleware] Error updating session:", error);
      if (isProtectedRoute) {
        const response = NextResponse.redirect(
          new URL("/sign-in", request.url),
        );
        response.cookies.delete("session");
        return response;
      }
      // For non-protected routes, just delete the stale session cookie
      const intlResponse = intlMiddleware(request);
      if (intlResponse) {
        intlResponse.cookies.delete("session");
        return intlResponse;
      }
    }
  }

  // Apply i18n middleware for all other requests
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.png|sounds/|manifest.json).*)",
  ],
  runtime: "nodejs",
};
