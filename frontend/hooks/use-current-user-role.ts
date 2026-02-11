/**
 * useCurrentUserRole Hook
 *
 * Derives the current user's team role by cross-referencing the user profile
 * (from useUser) with the team member list (from useTeam).
 *
 * Provides convenience flags for role-based UI gating:
 *   - isOwner, isAdmin, isAdminOrOwner — for privileged actions
 *   - isAgent, isViewer — for regular member checks
 *   - role — raw role string
 *
 * The backend already enforces data-level access control (agents/viewers
 * only see their own audit entries), so this hook is primarily for UX —
 * hiding/showing navigation items, buttons, and info banners.
 *
 * Usage:
 * ```tsx
 * const { isAdminOrOwner, role, isLoading } = useCurrentUserRole();
 *
 * if (isAdminOrOwner) {
 *   // Show admin-only UI
 * }
 * ```
 */

"use client";

import { useTeam } from "@/hooks/use-team";
import { useUser } from "@/hooks/use-user";
import { useMemo } from "react";

export interface UseCurrentUserRoleReturn {
  /** Raw role string (e.g. "Owner", "Admin", "Agent", "Viewer", or custom role name) */
  role: string | null;
  /** True if the user is the team owner */
  isOwner: boolean;
  /** True if the user has the Admin role */
  isAdmin: boolean;
  /** True if the user is Owner or Admin — use for privileged UI gating */
  isAdminOrOwner: boolean;
  /** True if the user has the Agent role */
  isAgent: boolean;
  /** True if the user has the Viewer role */
  isViewer: boolean;
  /** True while user or team data is still loading */
  isLoading: boolean;
}

export function useCurrentUserRole(): UseCurrentUserRoleReturn {
  const { user, isLoading: userLoading } = useUser();
  const { team, isLoading: teamLoading } = useTeam();

  return useMemo(() => {
    const isLoading = userLoading || teamLoading;

    if (!user || !team || !team.teamMembers) {
      return {
        role: null,
        isOwner: false,
        isAdmin: false,
        isAdminOrOwner: false,
        isAgent: false,
        isViewer: false,
        isLoading,
      };
    }

    // Find the current user's membership entry
    const membership = team.teamMembers.find(
      (m) => m.userId === user.id || m.user?.id === user.id,
    );

    const role = membership?.role ?? null;
    const roleLower = role?.toLowerCase() ?? "";

    return {
      role,
      isOwner: roleLower === "owner",
      isAdmin: roleLower === "admin",
      isAdminOrOwner: roleLower === "owner" || roleLower === "admin",
      isAgent: roleLower === "agent",
      isViewer: roleLower === "viewer",
      isLoading,
    };
  }, [user, team, userLoading, teamLoading]);
}

export default useCurrentUserRole;
