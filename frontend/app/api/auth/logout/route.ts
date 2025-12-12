import { NextRequest, NextResponse } from "next/server";

/**
 * Logout Endpoint
 * This endpoint handles logout by:
 * 1. Sending a logout request to the backend /auth/logout endpoint
 * 2. The backend clears the JWT cookies by sending Set-Cookie headers with maxAge: 0
 * 3. We forward those Set-Cookie headers back to the browser to clear cookies
 * 4. The browser automatically removes the cookies due to maxAge: 0
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[Logout Auth API] Logout request received");

    // Call the backend logout endpoint
    const backendResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/logout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Send cookies with the request
      }
    );

    console.log(
      "[Logout Auth API] Backend response status:",
      backendResponse.status
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      console.error("[Logout Auth API] Backend error:", errorData);
      return NextResponse.json(
        { error: "Failed to logout" },
        { status: backendResponse.status }
      );
    }

    // Parse the response body
    const data = await backendResponse.json();
    console.log("[Logout Auth API] Logout successful");

    // Get Set-Cookie headers from the backend response
    // These headers contain the cleared/expired cookies
    const setCookieHeaders = backendResponse.headers.getSetCookie();
    console.log(
      "[Logout Auth API] Set-Cookie headers received:",
      setCookieHeaders
    );

    // Create response
    const res = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    // Forward all Set-Cookie headers to the browser
    // This ensures the JWT cookies are cleared in the browser
    for (const setCookie of setCookieHeaders) {
      console.log(
        "[Logout Auth API] Forwarding Set-Cookie:",
        setCookie.substring(0, 50) + "..."
      );
      res.headers.append("Set-Cookie", setCookie);
    }

    console.log(
      "[Logout Auth API] Total Set-Cookie headers forwarded:",
      setCookieHeaders.length
    );

    return res;
  } catch (error) {
    console.error("[Logout Auth API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
