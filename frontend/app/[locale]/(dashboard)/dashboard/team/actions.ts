"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function getAuthHeaders() {
  const cookieJar = await cookies();
  const jwtToken = cookieJar.get("jwt_token")?.value;
  return {
    "Content-Type": "application/json",
    ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
  };
}

export async function getSystemPermissions() {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/teams/config/permissions`, {
      method: "GET",
      headers,
    });
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch permissions:", error);
    return [];
  }
}

export async function getTeamRoles(teamId: number) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/teams/${teamId}/roles`, {
      method: "GET",
      headers,
      next: { tags: [`team-${teamId}-roles`] },
    });
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch roles:", error);
    return [];
  }
}

export async function createTeamRole(teamId: number, data: any) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/teams/${teamId}/roles`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      return { error: error.message || "Failed to create role" };
    }

    revalidatePath("/dashboard/team");
    return { success: true, data: await response.json() };
  } catch (error) {
    console.error("Failed to create role:", error);
    return { error: "Failed to create role" };
  }
}

export async function updateTeamRole(
  teamId: number,
  roleId: number,
  data: any,
) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${BACKEND_URL}/teams/${teamId}/roles/${roleId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      return { error: error.message || "Failed to update role" };
    }

    revalidatePath("/dashboard/team");
    return { success: true, data: await response.json() };
  } catch (error) {
    console.error("Failed to update role:", error);
    return { error: "Failed to update role" };
  }
}

export async function deleteTeamRole(teamId: number, roleId: number) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${BACKEND_URL}/teams/${teamId}/roles/${roleId}`,
      {
        method: "DELETE",
        headers,
      },
    );

    if (!response.ok) {
      const error = await response.json();
      return { error: error.message || "Failed to delete role" };
    }

    revalidatePath("/dashboard/team");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete role:", error);
    return { error: "Failed to delete role" };
  }
}

export async function changeMemberRole(
  teamId: number,
  memberId: number,
  roleId: number,
) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${BACKEND_URL}/teams/${teamId}/members/${memberId}/role`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ role: roleId }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      return { error: error.message || "Failed to change role" };
    }

    revalidatePath("/dashboard/team");
    return { success: true };
  } catch (error) {
    console.error("Failed to change member role:", error);
    return { error: "Failed to change member role" };
  }
}
