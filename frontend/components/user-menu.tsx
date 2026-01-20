"use client";

import { signOut } from "@/app/[locale]/(login)/actions";
import { logoutClient } from "@/app/[locale]/(login)/logout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { backendApi, UserProfileDto } from "@/lib/api/endpoints";
import { TokenManager } from "@/lib/auth/token-manager";
import { Home, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * UserMenu component that displays either:
 * - Sign up/pricing links when user is not authenticated
 * - User avatar dropdown with dashboard/sign out options when authenticated
 *
 * Uses JWT-based authentication via TokenManager and backend API.
 * This component is used in both the landing page header and dashboard layout.
 */
export function UserMenu() {
  const t = useTranslations("header");
  const router = useRouter();
  const [user, setUser] = useState<UserProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user from backend API using JWT authentication
  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);
      try {
        // First check if we have valid tokens
        if (!TokenManager.isAccessTokenValid()) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        // Fetch user profile from backend
        const userData = await backendApi.user.getProfile();
        setUser(userData);
      } catch (error) {
        console.error("Failed to fetch user:", error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []);

  async function handleSignOut() {
    try {
      // Clear server-side session
      await signOut();
      // Clean up JWT tokens from client-side cookies
      logoutClient();
      // Clear the user data immediately
      setUser(null);
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
        <Avatar className="cursor-pointer size-9">
          <AvatarImage alt={user.name || ""} />
          <AvatarFallback>
            {user.email
              ? user.email.split("@")[0].substring(0, 2).toUpperCase()
              : "U"}
          </AvatarFallback>
        </Avatar>
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
