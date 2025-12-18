import { getUser } from "@/lib/db/queries";

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
