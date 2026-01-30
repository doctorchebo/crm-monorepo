/**
 * useTeam Hook
 *
 * Centralized hook for managing team data across the application.
 * Uses SWR for caching and automatic revalidation, ensuring that team data
 * (including members and subscription info) stays in sync across all components.
 *
 * Features:
 * - SWR-based caching with automatic revalidation
 * - Token-based authentication check before fetching
 * - Shared cache key for consistent data across components
 * - Manual revalidation via `mutateTeam` for immediate updates
 * - Properly typed team data including members
 *
 * Usage:
 * ```tsx
 * const { team, isLoading, mutateTeam } = useTeam();
 *
 * // Access team data
 * if (team) {
 *   console.log(team.name, team.teamMembers);
 * }
 *
 * // Trigger a refresh after team update
 * await mutateTeam();
 * ```
 */

import { backendApi } from "@/lib/api/endpoints";
import { TokenManager } from "@/lib/auth/token-manager";
import { TeamDataWithMembers } from "@/lib/db/schema";
import useSWR, { mutate } from "swr";

/**
 * SWR cache key for team data.
 * This key is used across the application for consistent caching.
 */
export const TEAM_CACHE_KEY = "team-details";

/**
 * Team member info returned from the backend API
 */
interface TeamMemberFromApi {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  name: string;
  email: string;
  role: string;
  roleId: number | null;
  joinedAt: string | null;
  isActive: boolean;
}

/**
 * Team info returned from the backend API
 */
interface TeamFromApi {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  ownerName?: string;
  memberCount: number;
  createdAt: string | null;
  planName?: string | null;
  subscriptionStatus?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeProductId?: string | null;
}

/**
 * Fetcher function for team data.
 * Fetches the user's teams and members, combining them into the expected structure.
 * Returns null if not authenticated.
 */
async function fetchTeamData(): Promise<TeamDataWithMembers | null> {
  // Check if we have valid tokens before making the request
  if (!TokenManager.isAccessTokenValid()) {
    return null;
  }

  try {
    // Fetch the user's teams
    const teams = (await backendApi.team.get()) as TeamFromApi[];

    if (!teams || teams.length === 0) {
      return null;
    }

    // Get the first team (most apps have one team per user)
    const team = teams[0];

    // Fetch team members
    const members = (await backendApi.team.getMembers(
      team.id.toString(),
    )) as TeamMemberFromApi[];

    // Transform to expected structure matching TeamDataWithMembers
    const teamData: TeamDataWithMembers = {
      id: team.id,
      name: team.name,
      createdAt: team.createdAt ? new Date(team.createdAt) : new Date(),
      updatedAt: new Date(),
      stripeCustomerId: team.stripeCustomerId ?? null,
      stripeSubscriptionId: team.stripeSubscriptionId ?? null,
      stripeProductId: team.stripeProductId ?? null,
      planName: team.planName ?? null,
      subscriptionStatus: team.subscriptionStatus ?? null,
      teamMembers: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        teamId: team.id,
        role: member.role,
        roleId: member.roleId,
        joinedAt: member.joinedAt ? new Date(member.joinedAt) : new Date(),
        user: {
          id: member.userId,
          name: member.name || member.userName,
          email: member.email || member.userEmail,
        },
      })),
    };

    return teamData;
  } catch (error) {
    console.error("Failed to fetch team data:", error);
    return null;
  }
}

/**
 * Hook for accessing and managing team data.
 *
 * @returns Object containing:
 * - `team`: The current team data or null if not authenticated/no team
 * - `isLoading`: Whether the initial fetch is in progress
 * - `isValidating`: Whether a revalidation is in progress
 * - `error`: Any error that occurred during fetching
 * - `mutateTeam`: Function to trigger a revalidation
 */
export function useTeam() {
  const {
    data: team,
    error,
    isLoading,
    isValidating,
    mutate: swrMutate,
  } = useSWR<TeamDataWithMembers | null>(TEAM_CACHE_KEY, fetchTeamData, {
    // Disable revalidateOnFocus to prevent data flash when switching browser tabs
    // Team data is stable and doesn't need constant refreshing
    revalidateOnFocus: false,
    // Don't retry on error (user might not be authenticated)
    shouldRetryOnError: false,
    // Revalidate on mount to ensure fresh data
    revalidateOnMount: true,
    // Dedupe requests within 2 seconds
    dedupingInterval: 2000,
    // Keep previous data while revalidating to prevent flash
    keepPreviousData: true,
  });

  return {
    team: team ?? null,
    isLoading,
    isValidating,
    error,
    mutateTeam: swrMutate,
  };
}

/**
 * Utility function to globally revalidate team data.
 * Can be called from anywhere (including non-React contexts).
 *
 * @example
 * // After successfully adding a team member
 * await revalidateTeam();
 */
export async function revalidateTeam(): Promise<void> {
  await mutate(TEAM_CACHE_KEY);
}

/**
 * Utility function to clear team data from cache.
 * Should be called on logout.
 */
export function clearTeamData(): void {
  mutate(TEAM_CACHE_KEY, null, { revalidate: false });
}
