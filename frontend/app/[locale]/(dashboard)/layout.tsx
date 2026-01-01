"use client";

import { EnableSoundsBanner } from "@/components/enable-sounds-banner";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { ChatNotificationsProvider } from "@/hooks/use-chat-notifications";
import { CircleIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

/**
 * Header component for the dashboard layout.
 * Uses the shared UserMenu component for consistent authentication UI.
 */
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
          <Suspense fallback={<div className="h-9 w-9" />}>
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
      <EnableSoundsBanner />
    </ChatNotificationsProvider>
  );
}
