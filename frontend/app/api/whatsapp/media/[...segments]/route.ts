import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint for WhatsApp media downloads
 * This endpoint bridges the frontend to the backend media endpoints
 * ensuring proper authentication and credential handling
 *
 * CRITICAL: This proxy must forward the JWT token from cookies to the backend
 * because server-side fetches don't automatically include cookies
 *
 * Handles two types of requests:
 * 1. `/download-url` endpoints - Returns JSON with presigned URL or cloud-api reference
 * 2. `cloud-api/:mediaId` endpoints - Returns actual media file bytes
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> }
) {
  try {
    const { segments } = await params;
    const path = segments.join("/");
    const queryString = request.nextUrl.search; // Get query parameters

    console.log("[WhatsApp Media Proxy] Requesting:", path);
    console.log("[WhatsApp Media Proxy] Query string:", queryString);

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const fullUrl = `${backendUrl}/whatsapp/media/${path}${queryString}`;

    console.log("[WhatsApp Media Proxy] Full URL:", fullUrl);

    // Get JWT token from cookies
    const cookieJar = await cookies();
    const jwtToken = cookieJar.get("jwt_token")?.value;

    console.log("[WhatsApp Media Proxy] JWT token available:", !!jwtToken);

    // Prepare headers
    const headers: Record<string, string> = {
      Accept: request.headers.get("accept") || "*/*",
      "User-Agent": request.headers.get("user-agent") || "",
    };

    // Add JWT token to Authorization header if available
    if (jwtToken) {
      headers["Authorization"] = `Bearer ${jwtToken}`;
      console.log("[WhatsApp Media Proxy] Added Authorization header with JWT");
    }

    // Fetch from backend with JWT token in Authorization header
    const response = await fetch(fullUrl, {
      method: "GET",
      headers,
    });

    console.log(
      "[WhatsApp Media Proxy] Backend response status:",
      response.status
    );

    if (!response.ok) {
      console.error(
        "[WhatsApp Media Proxy] Backend error:",
        response.statusText
      );
      return NextResponse.json(
        { error: `Backend error: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the content type from the backend response
    const contentType = response.headers.get("content-type");

    // Check if this is a JSON response (download-url endpoint) or binary (cloud-api media)
    if (contentType?.includes("application/json")) {
      // This is a download-url endpoint returning JSON with presigned URL
      // Just forward it to the client as-is
      console.log("[WhatsApp Media Proxy] JSON response, forwarding to client");
      const jsonData = await response.json();
      return NextResponse.json(jsonData, { status: 200 });
    }

    // This is actual media file bytes (cloud-api endpoint)
    const buffer = await response.arrayBuffer();

    // Return the media file with proper content type
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("[WhatsApp Media Proxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
