import { backendApi } from "@/lib/api/endpoints";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const team = await backendApi.team.get();
    return NextResponse.json(team);
  } catch (error) {
    console.error("Error fetching team:", error);
    return NextResponse.json(
      { error: "Failed to fetch team" },
      { status: 500 }
    );
  }
}
