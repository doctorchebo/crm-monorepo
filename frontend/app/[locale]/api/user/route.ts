import { backendApi } from "@/lib/api/endpoints";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await backendApi.user.getProfile();
    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch user profile" },
      { status: 500 }
    );
  }
}
