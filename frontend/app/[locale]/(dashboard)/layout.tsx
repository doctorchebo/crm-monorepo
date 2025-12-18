"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatNotificationsProvider } from "@/hooks/use-chat-notifications";
import { backendApi } from "@/lib/api/endpoints";
import { TokenManager } from "@/lib/auth/token-manager";
import { CircleIcon, Home, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { logoutClient } from "../(login)/logout";

interface UserData {
  id: number;
  email: string;
  name?: string;
}

function UserMenu() {
  const t = useTranslations("header");
  const [user, setUser] = useState<UserData | null>(null);
  const router = useRouter();

  // Fetch user from backend API on mount
  useEffect(() => {
    const fetchUser = async () => {
      if (!TokenManager.isAccessTokenValid()) {
        setUser(null);
        return;
      }
      try {
        const userData = await backendApi.user.getProfile();
        setUser(userData);
      } catch (error) {
        console.error("Failed to fetch user:", error);
        setUser(null);
      }
    };

    fetchUser();
  }, []);

  async function handleSignOut() {
    try {
      // Clean up JWT token from client-side cookies
      logoutClient();
      setUser(null);
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      // Redirect after a short delay to ensure UI updates
      await new Promise((resolve) => setTimeout(resolve, 100));
      router.push("/");
    }
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
            {user && user.email
              ? user.email
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
              : "U"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex flex-col gap-1">
        <DropdownMenuItem className="cursor-pointer">
          <Link href="/dashboard" className="flex w-full items-center">
            <Home className="mr-2 h-4 w-4" />
            <span>{t("dashboard")}</span>
          </Link>
        </DropdownMenuItem>
        <form action={handleSignOut} className="w-full">
          <button type="submit" className="flex w-full">
            <DropdownMenuItem className="w-full flex-1 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>{t("signOut")}</span>
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <CircleIcon className="h-6 w-6 text-orange-500" />
          <span className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
            ACME
          </span>
        </Link>
        <div className="flex items-center space-x-2">
          <ThemeToggle />
          <LanguageSwitcher />
          <Suspense fallback={<div className="h-9" />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ChatNotificationsProvider>
      <section className="flex flex-col h-screen">
        <Header />
        <div className="flex-1 overflow-auto">{children}</div>
      </section>
    </ChatNotificationsProvider>
  );
}
