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
    "jwt_token_expires_at"
  )?.value;
  const refreshTokenExpiresAt = request.cookies.get(
    "jwt_refresh_token_expires_at"
  )?.value;

  // Redirect to login if accessing protected route without valid tokens
  if (isProtectedRoute) {
    // If both access and refresh tokens don't exist, redirect to login
    if (!accessToken || !refreshToken) {
      const response = NextResponse.redirect(new URL("/sign-in", request.url));
      response.cookies.delete("jwt_token");
      response.cookies.delete("jwt_refresh_token");
      response.cookies.delete("jwt_token_expires_at");
      response.cookies.delete("jwt_refresh_token_expires_at");
      response.cookies.delete("session");
      return response;
    }

    // IMPORTANT: If tokens exist, we should trust them unless we can PROVE they're expired
    // The expiration tracking cookies might not be set yet (race condition on first load)
    // Only redirect if we can prove refresh token is expired

    if (refreshTokenExpiresAt) {
      try {
        const expiresAt = new Date(refreshTokenExpiresAt);
        const now = new Date();
        if (expiresAt <= now) {
          // Refresh token is DEFINITELY expired
          const response = NextResponse.redirect(
            new URL("/sign-in", request.url)
          );
          response.cookies.delete("jwt_token");
          response.cookies.delete("jwt_refresh_token");
          response.cookies.delete("jwt_token_expires_at");
          response.cookies.delete("jwt_refresh_token_expires_at");
          response.cookies.delete("session");
          return response;
        }
        // Refresh token is still valid, allow request
      } catch (error) {
        console.error(
          "[Middleware] Error parsing refresh token expiry:",
          error
        );
        // If we can't parse expiry, allow request - tokens are probably fine
      }
    } else {
      // No expiration tracking cookie yet - this is normal on first login
      // Tokens exist in HTTP-only cookies, so allow the request
      // Client will set tracking cookies asynchronously
      console.debug(
        "[Middleware] Tokens exist but no expiration tracking cookies yet - allowing request"
      );
    }

    // If access token is expired but refresh token is valid,
    // let the request through. Client-side will handle refresh automatically.
    if (accessTokenExpiresAt) {
      try {
        const expiresAt = new Date(accessTokenExpiresAt);
        const now = new Date();
        if (expiresAt <= now) {
          console.debug(
            "[Middleware] Access token expired, but refresh token is valid. Client will refresh."
          );
          // Don't redirect - let page load, client will refresh token
        }
      } catch (error) {
        console.error("[Middleware] Error parsing access token expiry:", error);
      }
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
