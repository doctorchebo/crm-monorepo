"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { CircleIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

/**
 * Header component for the landing page.
 * Includes branding, theme toggle, language switcher, and user menu.
 *
 * Uses the shared UserMenu component which handles authentication state
 * via JWT tokens from the backend.
 */
export function Header() {
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
