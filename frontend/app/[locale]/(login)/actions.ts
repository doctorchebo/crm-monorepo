"use server";

import {
  validatedAction,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { comparePasswords, hashPassword, setSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { getUserWithTeam } from "@/lib/db/queries";
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
import { z } from "zod";

/** Derive audit metadata from an ActivityType so every frontend-originated
 *  record matches the format the backend AuditWriteService produces. */
function getAuditMeta(type: ActivityType): {
  category: string;
  entityType: string;
} {
  switch (type) {
    case ActivityType.SIGN_UP:
    case ActivityType.SIGN_IN:
    case ActivityType.SIGN_OUT:
    case ActivityType.UPDATE_PASSWORD:
    case ActivityType.DELETE_ACCOUNT:
    case ActivityType.UPDATE_ACCOUNT:
      return { category: "auth", entityType: "user" };
    case ActivityType.CREATE_TEAM:
    case ActivityType.REMOVE_TEAM_MEMBER:
    case ActivityType.INVITE_TEAM_MEMBER:
    case ActivityType.ACCEPT_INVITATION:
      return { category: "team", entityType: "team_member" };
    default:
      return { category: "other", entityType: "user" };
  }
}

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  options?: { ipAddress?: string; userName?: string | null },
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const { category, entityType } = getAuditMeta(type);
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    category,
    entityType,
    entityId: String(userId),
    userName: options?.userName ?? null,
    ipAddress: options?.ipAddress ?? null,
    description: type.replace(/_/g, " "),
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

  // IMPORTANT: Store tracking cookies with LONGER expiration than the tokens themselves
  // This ensures we can always check token validity client-side, even after tokens expire
  // The tracking cookie should live as long as the refresh token (7 days)
  const trackingCookieExpiry = refreshTokenExpiry;

  cookieJar.set("jwt_token_expires_at", accessTokenExpiry.toISOString(), {
    httpOnly: false, // Client needs to read this
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: trackingCookieExpiry, // Keep tracking cookie alive for 7 days
  });

  cookieJar.set(
    "jwt_refresh_token_expires_at",
    refreshTokenExpiry.toISOString(),
    {
      httpOnly: false, // Client needs to read this
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: trackingCookieExpiry, // Keep tracking cookie alive for 7 days
    },
  );

  console.log("[SignIn] All cookies set successfully");

  // Audit for sign-in is already recorded by the backend during authenticateWithBackend().
  // No local logActivity call needed — avoids duplicate/malformed ghost records.
  await setSession(foundUser);

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

      await logActivity(
        teamId,
        createdUser.id,
        ActivityType.ACCEPT_INVITATION,
        {
          userName: createdUser.email,
        },
      );

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

    await logActivity(teamId, createdUser.id, ActivityType.CREATE_TEAM, {
      userName: createdUser.email,
    });
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
    logActivity(teamId, createdUser.id, ActivityType.SIGN_UP, {
      userName: createdUser.email,
    }),
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
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD, {
        userName: user.name,
      }),
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
      { userName: user.name },
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

    // Clear session and tokens
    await signOut();

    return { success: "Account deleted successfully." };
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
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT, {
        userName: user.name,
      }),
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
      { userName: user.name },
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
  const cookieJar = await cookies();

  // Read the JWT before clearing anything — the backend uses it to identify
  // the user and record the sign-out in the audit log.
  const jwtToken = cookieJar.get("jwt_token")?.value;

  try {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    const response = await fetch(`${backendUrl}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward the JWT so the backend can log the sign-out audit entry.
        // decode() on the backend side works even if the token is expired.
        ...(jwtToken && { Authorization: `Bearer ${jwtToken}` }),
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

  // Clear all cookies
  cookieJar.delete("session");
  cookieJar.delete("jwt_token");
  cookieJar.delete("jwt_refresh_token");
  cookieJar.delete("jwt_token_expires_at");
  cookieJar.delete("jwt_refresh_token_expires_at");

  console.debug("[SignOut] All session and JWT cookies cleared");
}
