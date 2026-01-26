"use client";

import { signOut } from "@/app/[locale]/(login)/actions";
import { logoutClient } from "@/app/[locale]/(login)/logout";
import { SmartAvatar } from "@/components/smart-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearUserProfile, useUser } from "@/hooks/use-user";
import { Home, LogOut, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * UserMenu component that displays either:
 * - Sign up/pricing links when user is not authenticated
 * - User avatar dropdown with dashboard/sign out options when authenticated
 *
 * Uses the centralized useUser hook with SWR for caching and automatic updates.
 * Profile picture changes from settings will automatically reflect here.
 * This component is used in both the landing page header and dashboard layout.
 */
export function UserMenu() {
  const t = useTranslations("header");
  const router = useRouter();

  // Use centralized user hook with SWR for automatic updates
  const { user, isLoading } = useUser();

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

  // Show loading state briefly
  if (isLoading) {
    return <div className="h-9 w-9" />;
  }

  if (!user) {
    return (
      <>
        <Link
          href="/pricing"
          className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          {t("pricing")}
        </Link>
        <Link
          href="/sign-in"
          className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          {t("signIn")}
        </Link>
        <Button asChild className="rounded-full">
          <Link href="/sign-up">{t("signUp")}</Link>
        </Button>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring rounded-full">
          <SmartAvatar
            isLoading={isLoading}
            hasProfilePicture={!!user.profilePictureUrl}
            profilePictureUrl={user.profilePictureUrl}
            name={user.name}
            email={user.email}
            size="sm"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 flex flex-col gap-1">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" asChild>
          <Link href="/dashboard" className="flex w-full items-center">
            <Home className="mr-2 h-4 w-4" />
            <span>{t("dashboard")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" asChild>
          <Link href="/dashboard/general" className="flex w-full items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>{t("settings") || "Settings"}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer w-full"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t("signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
