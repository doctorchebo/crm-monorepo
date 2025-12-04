import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { teamMembers, teams, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's team via team members
    const userTeam = await db
      .select({
        team: teams,
        members: teamMembers,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    if (!userTeam.length) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Get all team members for this team
    const allMembers = await db
      .select({
        teamMember: teamMembers,
        user: users,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, userTeam[0].team.id));

    const team = userTeam[0].team;
    const membersList = allMembers.map((m) => ({
      ...m.teamMember,
      user: m.user,
    }));

    return Response.json({
      ...team,
      teamMembers: membersList,
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
