import { backendApi } from "@/lib/api/endpoints";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.redirect(new URL("/pricing", request.url));
  }

  try {
    // Call backend to retrieve checkout session and handle subscription updates
    const session = await backendApi.billing.getCheckoutSession(sessionId);

    if (!session) {
      throw new Error("Failed to retrieve checkout session from backend");
    }

    // Backend handles all subscription updates and redirects
    // Redirect to dashboard after successful payment
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("Error handling successful checkout:", error);
    return NextResponse.redirect(new URL("/error", request.url));
  }
}
