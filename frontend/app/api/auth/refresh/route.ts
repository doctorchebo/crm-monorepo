import { NextRequest, NextResponse } from "next/server";

/**
 * Refresh Token Endpoint
 * This endpoint handles token refresh by:
 * 1. Sending the refresh token to the backend /auth/refresh endpoint
 * 2. The backend validates the refresh token and issues a new access token
 * 3. The backend sets the new access token as an HTTP-only cookie
 * 4. We forward the Set-Cookie headers back to the browser
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[Refresh Auth API] Refresh token request received");

    // Call the backend refresh endpoint
    // The refresh token is automatically sent in cookies because we use credentials: include
    const backendResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Send cookies with the request (includes refresh token)
      }
    );

    console.log(
      "[Refresh Auth API] Backend response status:",
      backendResponse.status
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      console.error("[Refresh Auth API] Backend error:", errorData);
      return NextResponse.json(
        { error: "Failed to refresh token" },
        { status: backendResponse.status }
      );
    }

    // Parse the response body
    const data = await backendResponse.json();
    console.log("[Refresh Auth API] Token refreshed successfully");

    // Get Set-Cookie headers from the backend response
    // This array contains the Set-Cookie headers that the backend sent
    const setCookieHeaders = backendResponse.headers.getSetCookie();
    console.log(
      "[Refresh Auth API] Set-Cookie headers received:",
      setCookieHeaders
    );

    // Create response with the refreshed token data
    const res = NextResponse.json({
      success: true,
      access_token: data.access_token,
      expiresAt: data.expiresAt,
    });

    // Forward all Set-Cookie headers to the browser
    // This ensures the new access token cookie is set in the browser
    for (const setCookie of setCookieHeaders) {
      console.log(
        "[Refresh Auth API] Forwarding Set-Cookie:",
        setCookie.substring(0, 50) + "..."
      );
      res.headers.append("Set-Cookie", setCookie);
    }

    console.log(
      "[Refresh Auth API] Total Set-Cookie headers forwarded:",
      setCookieHeaders.length
    );

    return res;
  } catch (error) {
    console.error("[Refresh Auth API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
