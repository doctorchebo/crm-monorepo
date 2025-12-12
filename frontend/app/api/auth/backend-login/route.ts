import { NextRequest, NextResponse } from "next/server";

/**
 * Route handler to authenticate with backend and set JWT cookies
 *
 * Flow:
 * 1. Receive login credentials from client
 * 2. Forward to backend /auth/login
 * 3. Backend sets Set-Cookie headers AND returns tokens in JSON body
 * 4. We manually set the cookies in the response to the client
 * 5. Cookies are automatically stored by the browser
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    console.log("[Backend Login API] Login request for:", email);

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    console.log("[Backend Login API] Calling backend at:", backendUrl);

    const response = await fetch(`${backendUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });

    console.log(
      "[Backend Login API] Backend response status:",
      response.status
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Backend Login API] Backend error:", errorText);
      return NextResponse.json(
        { error: "Backend authentication failed" },
        { status: response.status }
      );
    }

    // Parse the response body
    const data = await response.json();

    console.log("[Backend Login API] Response data received:", {
      hasAccessToken: !!data?.access_token,
      hasRefreshToken: !!data?.refresh_token,
      hasUser: !!data?.user,
    });

    if (!data?.access_token || !data?.refresh_token || !data?.user) {
      console.error("[Backend Login API] Missing tokens or user in response");
      return NextResponse.json(
        { error: "Incomplete authentication response" },
        { status: 400 }
      );
    }

    // Create response with user data
    const res = NextResponse.json({
      success: true,
      user: data.user,
      expiresAt: data.expiresAt,
    });

    // CRITICAL: Manually set JWT cookies in the response
    // We do this because fetch API doesn't automatically forward Set-Cookie headers
    // from cross-origin responses back to the client

    // Set access token cookie (1 hour)
    res.cookies.set({
      name: "jwt_token",
      value: data.access_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour in seconds
    });

    // Also manually append Set-Cookie header as a fallback
    const tokenCookie = `jwt_token=${data.access_token}; Path=/; Max-Age=${
      60 * 60
    }; HttpOnly; SameSite=${
      process.env.NODE_ENV === "production" ? "Strict" : "Lax"
    }${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
    res.headers.append("Set-Cookie", tokenCookie);

    console.log("[Backend Login API] jwt_token cookie set");

    // Set refresh token cookie (7 days)
    res.cookies.set({
      name: "jwt_refresh_token",
      value: data.refresh_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    // Also manually append Set-Cookie header as a fallback
    const refreshTokenCookie = `jwt_refresh_token=${
      data.refresh_token
    }; Path=/; Max-Age=${7 * 24 * 60 * 60}; HttpOnly; SameSite=${
      process.env.NODE_ENV === "production" ? "Strict" : "Lax"
    }${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
    res.headers.append("Set-Cookie", refreshTokenCookie);

    console.log("[Backend Login API] jwt_refresh_token cookie set");

    // Also set expiration timestamp cookies (non-httpOnly, for client-side tracking)
    if (data.expiresAt?.access) {
      const accessExpiresAt = new Date(data.expiresAt.access).getTime() / 1000;
      res.cookies.set({
        name: "jwt_token_expires_at",
        value: String(accessExpiresAt),
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        path: "/",
        maxAge: 60 * 60,
      });
    }

    if (data.expiresAt?.refresh) {
      const refreshExpiresAt =
        new Date(data.expiresAt.refresh).getTime() / 1000;
      res.cookies.set({
        name: "jwt_refresh_token_expires_at",
        value: String(refreshExpiresAt),
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    console.log("[Backend Login API] All cookies set successfully");

    // Log the response headers to verify Set-Cookie headers are present
    const responseCookieHeaders = res.headers.getSetCookie();
    console.log("[Backend Login API] Response Set-Cookie headers:", {
      count: responseCookieHeaders.length,
      headers: responseCookieHeaders.map((h) => h.substring(0, 80) + "..."),
    });

    return res;
  } catch (error) {
    console.error("[Backend Login API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
