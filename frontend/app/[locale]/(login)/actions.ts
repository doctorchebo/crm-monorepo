"use server";

import {
  validatedAction,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { comparePasswords, hashPassword, setSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { getUser, getUserWithTeam } from "@/lib/db/queries";
import {
  activityLogs,
  ActivityType,
  chats,
  invitations,
  teamMembers,
  teams,
  users,
  type NewActivityLog,
  type NewTeam,
  type NewTeamMember,
  type NewUser,
} from "@/lib/db/schema";
import { createCheckoutSession } from "@/lib/payments/stripe";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string,
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || "",
  };
  await db.insert(activityLogs).values(newActivity);
}

async function authenticateWithBackend(
  email: string,
  password: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expiresAt: { access: string; refresh: string };
} | null> {
  try {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(`${backendUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Important: allow cookies from backend response
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error(`Backend auth failed: ${response.statusText}`);
    }

    const data = await response.json();

    // CRITICAL: Get Set-Cookie headers from backend response
    const setCookieHeaders = response.headers.getSetCookie();
    console.log(
      "[authenticateWithBackend] Set-Cookie headers from backend:",
      setCookieHeaders.length,
    );

    return {
      access_token: data?.access_token || "",
      refresh_token: data?.refresh_token || "",
      expiresAt: data?.expiresAt || {
        access: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        refresh: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  } catch (err) {
    console.error("Backend authentication failed:", err);
    return null;
  }
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  const userWithTeam = await db
    .select({
      user: users,
      team: teams,
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(users.email, email))
    .limit(1);

  if (userWithTeam.length === 0) {
    return {
      error: "Invalid email or password. Please try again.",
      email,
      password,
    };
  }

  const { user: foundUser, team: foundTeam } = userWithTeam[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash,
  );

  if (!isPasswordValid) {
    return {
      error: "Invalid email or password. Please try again.",
      email,
      password,
    };
  }
  // Get JWT tokens from backend (both access and refresh)
  // The backend sets them as HTTP-only cookies in the response
  // Browser automatically stores and sends them with subsequent requests
  console.log("[SignIn] Authenticating with backend...");
  const authResult = await authenticateWithBackend(email, password);

  if (!authResult || !authResult.expiresAt) {
    console.error("[SignIn] Backend auth failed:", authResult);
    return {
      error: "Failed to authenticate with backend",
      email,
      password,
    };
  }

  console.log("[SignIn] Backend auth successful", {
    hasAccessToken: !!authResult.access_token,
    hasRefreshToken: !!authResult.refresh_token,
    expiresAt: authResult.expiresAt,
  });

  // CRITICAL: Manually set JWT cookies from backend response
  // Server-side fetches don't automatically propagate Set-Cookie headers to the browser
  // We need to explicitly set them using the cookies API
  const isProduction = process.env.NODE_ENV === "production";
  const cookieJar = await cookies();
  const accessTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
  const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Set the actual JWT tokens as HTTP-only cookies
  if (authResult.access_token) {
    cookieJar.set("jwt_token", authResult.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: accessTokenExpiry,
    });
    console.log("[SignIn] jwt_token cookie set");
  }

  if (authResult.refresh_token) {
    cookieJar.set("jwt_refresh_token", authResult.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: refreshTokenExpiry,
    });
    console.log("[SignIn] jwt_refresh_token cookie set");
  }

  // Only store tracking cookies for client-side expiration awareness
  // The actual JWT tokens are handled by HTTP-only cookies from the backend
  cookieJar.set("jwt_token_expires_at", accessTokenExpiry.toISOString(), {
    httpOnly: false, // Client needs to read this
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: accessTokenExpiry,
  });

  cookieJar.set(
    "jwt_refresh_token_expires_at",
    refreshTokenExpiry.toISOString(),
    {
      httpOnly: false, // Client needs to read this
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: refreshTokenExpiry,
    },
  );

  console.log("[SignIn] All cookies set successfully");

  await Promise.all([
    setSession(foundUser),
    logActivity(foundTeam?.id, foundUser.id, ActivityType.SIGN_IN),
  ]);

  const redirectTo = formData.get("redirect") as string | null;
  if (redirectTo === "checkout") {
    const priceId = formData.get("priceId") as string;
    return createCheckoutSession({ team: foundTeam, priceId });
  }

  // Return expiration times to client so it can initialize TokenManager
  // (actual tokens are set as HTTP-only cookies by server action)
  return {
    expiresAt: authResult.expiresAt,
  };
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional(),
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: "Failed to create user. Please try again.",
      email,
      password,
    };
  }

  const passwordHash = await hashPassword(password);

  const newUser: NewUser = {
    email,
    passwordHash,
    role: "owner", // Default role, will be overridden if there's an invitation
  };

  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: "Failed to create user. Please try again.",
      email,
      password,
    };
  }

  let teamId: number;
  let userRole: string;
  let createdTeam: typeof teams.$inferSelect | null = null;

  if (inviteId) {
    // Check if there's a valid invitation
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, parseInt(inviteId)),
          eq(invitations.email, email),
          eq(invitations.status, "pending"),
        ),
      )
      .limit(1);

    if (invitation) {
      teamId = invitation.teamId;
      userRole = invitation.role;

      await db
        .update(invitations)
        .set({ status: "accepted" })
        .where(eq(invitations.id, invitation.id));

      await logActivity(teamId, createdUser.id, ActivityType.ACCEPT_INVITATION);

      [createdTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
    } else {
      return { error: "Invalid or expired invitation.", email, password };
    }
  } else {
    // Create a new team if there's no invitation
    const newTeam: NewTeam = {
      name: `${email}'s Team`,
    };

    [createdTeam] = await db.insert(teams).values(newTeam).returning();

    if (!createdTeam) {
      return {
        error: "Failed to create team. Please try again.",
        email,
        password,
      };
    }

    teamId = createdTeam.id;
    userRole = "owner";

    await logActivity(teamId, createdUser.id, ActivityType.CREATE_TEAM);
  }

  const newTeamMember: NewTeamMember = {
    userId: createdUser.id,
    teamId: teamId,
    role: userRole,
  };

  // Get JWT tokens from backend
  console.log("[SignUp] Authenticating with backend...");
  const authResult = await authenticateWithBackend(email, password);

  if (!authResult || !authResult.expiresAt) {
    console.error("[SignUp] Backend auth failed:", authResult);
    return {
      error: "Failed to authenticate with backend",
      email,
      password,
    };
  }

  console.log("[SignUp] Backend auth successful", {
    hasAccessToken: !!authResult.access_token,
    hasRefreshToken: !!authResult.refresh_token,
    expiresAt: authResult.expiresAt,
  });

  // Set JWT cookies the same way as signIn
  const isProduction = process.env.NODE_ENV === "production";
  const cookieJar = await cookies();
  const accessTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
  const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Set the actual JWT tokens as HTTP-only cookies
  if (authResult.access_token) {
    cookieJar.set("jwt_token", authResult.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: accessTokenExpiry,
    });
    console.log("[SignUp] jwt_token cookie set");
  }

  if (authResult.refresh_token) {
    cookieJar.set("jwt_refresh_token", authResult.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: refreshTokenExpiry,
    });
    console.log("[SignUp] jwt_refresh_token cookie set");
  }

  // Set tracking cookies for client-side expiration awareness
  cookieJar.set("jwt_token_expires_at", accessTokenExpiry.toISOString(), {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: accessTokenExpiry,
  });

  cookieJar.set(
    "jwt_refresh_token_expires_at",
    refreshTokenExpiry.toISOString(),
    {
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: refreshTokenExpiry,
    },
  );

  console.log("[SignUp] All JWT cookies set successfully");

  await Promise.all([
    db.insert(teamMembers).values(newTeamMember),
    logActivity(teamId, createdUser.id, ActivityType.SIGN_UP),
    setSession(createdUser),
  ]);

  const redirectTo = formData.get("redirect") as string | null;
  if (redirectTo === "checkout") {
    const priceId = formData.get("priceId") as string;
    return createCheckoutSession({ team: createdTeam, priceId });
  }

  // Return expiration times to client so it can initialize TokenManager
  return { expiresAt: authResult.expiresAt };
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "Current password is incorrect.",
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "New password must be different from the current password.",
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "New password and confirmation password do not match.",
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD),
    ]);

    return {
      success: "Password updated successfully.",
    };
  },
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: "Incorrect password. Account deletion failed.",
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT,
    );

    // Soft delete
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')`, // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));

    if (userWithTeam?.teamId) {
      // Find team owner to reassign chats
      const teamOwner = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, userWithTeam.teamId),
          eq(teamMembers.role, "owner"),
        ),
        columns: { userId: true },
      });

      // If an owner exists (should always be true) and it's not the user deleting their account
      if (teamOwner && teamOwner.userId !== user.id) {
        // Reassign all chats assigned to this user to the team owner
        await db
          .update(chats)
          .set({
            assignedTo: teamOwner.userId,
            assignedBy: null, // System reassignment
            assignedAt: new Date(),
          })
          .where(
            and(
              eq(chats.teamId, userWithTeam.teamId),
              eq(chats.assignedTo, user.id),
            ),
          );
      }

      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, user.id),
            eq(teamMembers.teamId, userWithTeam.teamId),
          ),
        );
    }

    (await cookies()).delete("session");
    redirect("/sign-in");
  },
);

const updateAccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT),
    ]);

    return { name, success: "Account updated successfully." };
  },
);

const removeTeamMemberSchema = z.object({
  memberId: z.number(),
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: "User is not part of a team" };
    }

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.teamId, userWithTeam.teamId),
        ),
      );

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.REMOVE_TEAM_MEMBER,
    );

    return { success: "Team member removed successfully" };
  },
);

const inviteTeamMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["member", "owner", "admin", "agent", "viewer"]),
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: "User is not part of a team" };
    }

    try {
      // Get JWT token from cookies to authenticate with backend
      const cookieJar = await cookies();
      const jwtToken = cookieJar.get("jwt_token")?.value;

      if (!jwtToken) {
        return { error: "Authentication required. Please sign in again." };
      }

      const backendUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      // Call backend API which handles SQS email delivery
      const response = await fetch(
        `${backendUrl}/teams/${userWithTeam.teamId}/invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({ email, role }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.message || `Failed to send invitation (${response.status})`;
        console.error("[inviteTeamMember] Backend error:", errorMessage);
        return { error: errorMessage };
      }

      const result = await response.json();
      console.log("[inviteTeamMember] Invitation sent successfully:", result);

      return { success: "Invitation sent successfully" };
    } catch (error) {
      console.error("[inviteTeamMember] Failed to send invitation:", error);
      return { error: "Failed to send invitation. Please try again." };
    }
  },
);

/**
 * Server-side logout action
 * Calls backend to clear JWT cookies and logs the sign-out activity
 */
export async function signOut() {
  try {
    // Log activity before clearing session
    const user = await getUser();
    if (user) {
      const userWithTeam = await getUserWithTeam(user.id);
      await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    // Call backend logout endpoint to clear HTTP-only cookies
    const response = await fetch(`${backendUrl}/auth/logout`, {
      method: "POST",
      credentials: "include", // Send cookies with request
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("[SignOut] Backend logout failed:", response.statusText);
    } else {
      console.debug("[SignOut] Backend logout successful");
    }
  } catch (error) {
    console.error("[SignOut] Failed to call backend logout:", error);
  }

  // Clear session cookie
  const cookieJar = await cookies();
  cookieJar.delete("session");

  console.debug("[SignOut] Session cookie cleared");
}
