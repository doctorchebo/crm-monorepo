"use client";

import { signOut } from "@/app/[locale]/(login)/actions";
import { logoutClient } from "@/app/[locale]/(login)/logout";
import { SettingsModal } from "@/components/settings-modal";
import { SmartAvatar } from "@/components/smart-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useTeam } from "@/hooks/use-team";
import { clearUserProfile, useUser } from "@/hooks/use-user";
import { LogOut, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * SidebarUserProfile - Displays user profile at the bottom of the sidebar
 *
 * Behavior:
 * - Desktop expanded: Shows avatar (sm), name, and subscription plan
 * - Desktop collapsed: Shows only avatar (xs size) centered
 * - Mobile: Always shows avatar (sm), name, and subscription plan (mobile sidebar is always "expanded" when open)
 *
 * On click, opens a dropdown menu above the profile with:
 * - User profile info (avatar, name, email)
 * - Settings option (opens settings modal)
 * - Logout option
 *
 * This component is designed to be placed in the SidebarFooter
 * of the application sidebar, similar to apps like ChatGPT.
 */
export function SidebarUserProfile() {
  const t = useTranslations("sidebar");
  const tHeader = useTranslations("header");
  const router = useRouter();
  const { state, isMobile } = useSidebar();

  const { user, isLoading: isUserLoading } = useUser();
  const { team, isLoading: isTeamLoading } = useTeam();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const planName = team?.planName || t("freePlan");
  const isLoading = isUserLoading || isTeamLoading;

  // On mobile, sidebar is never truly "collapsed" - when open it shows full content
  // Only desktop sidebar can be collapsed to icon-only mode
  const isCollapsed = !isMobile && state === "collapsed";

  // Determine if we should show user details (name + plan)
  // Show on mobile (always) and on desktop when expanded
  const showUserDetails = isMobile || !isCollapsed;

  async function handleSignOut() {
    try {
      // Clear server-side session
      await signOut();
      // Clean up JWT tokens from client-side cookies
      logoutClient();
      // Clear the user profile from SWR cache
      clearUserProfile();
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      // Redirect after a short delay to ensure UI updates
      await new Promise((resolve) => setTimeout(resolve, 100));
      router.push("/");
    }
  }

  // Don't render anything if no user is authenticated
  if (!user && !isLoading) {
    return null;
  }

  return (
    <>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size={isCollapsed ? "default" : "lg"}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  tooltip={isCollapsed ? user?.name || t("user") : undefined}
                >
                  {/* Wrapper div prevents the avatar (which renders as span) from being 
                      hidden by the sidebar's collapsed mode CSS selector [&>span]:hidden */}
                  <div className="shrink-0">
                    <SmartAvatar
                      isLoading={isLoading}
                      hasProfilePicture={!!user?.profilePictureUrl}
                      profilePictureUrl={user?.profilePictureUrl}
                      name={user?.name}
                      email={user?.email}
                      size="sm"
                      className="rounded-lg"
                    />
                  </div>
                  {showUserDetails && (
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {isLoading ? t("loading") : user?.name || t("user")}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {planName}
                      </span>
                    </div>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side="top"
                align="start"
                sideOffset={4}
              >
                {/* User info header */}
                <div className="flex items-center gap-2 px-2 py-2">
                  <SmartAvatar
                    isLoading={isLoading}
                    hasProfilePicture={!!user?.profilePictureUrl}
                    profilePictureUrl={user?.profilePictureUrl}
                    name={user?.name}
                    email={user?.email}
                    size="md"
                  />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user?.name || t("user")}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                {/* Settings */}
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{tHeader("settings")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Logout */}
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="cursor-pointer text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400 focus:bg-red-100 dark:focus:bg-red-950"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{tHeader("signOut")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
