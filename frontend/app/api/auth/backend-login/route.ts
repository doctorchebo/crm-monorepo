import { NextRequest, NextResponse } from "next/server";

/**
 * Route handler to authenticate with backend and set JWT token cookie
 * This is used by client components to get a JWT token
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(`${backendUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Backend authentication failed" },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data?.access_token) {
      return NextResponse.json(
        { error: "No access token received from backend" },
        { status: 400 }
      );
    }

    // Create response with JWT token set as cookie
    const res = NextResponse.json({ success: true });

    res.cookies.set("jwt_token", data.access_token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600, // 1 hour
      path: "/",
    });

    return res;
  } catch (error) {
    console.error("Backend login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
