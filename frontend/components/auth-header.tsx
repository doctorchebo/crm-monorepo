"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CircleIcon } from "lucide-react";
import Link from "next/link";

/**
 * AuthHeader - A minimal header component for authentication pages (sign-in, sign-up).
 *
 * This component provides essential functionality for auth pages:
 * - Theme toggle (light/dark/system) - uses localStorage for persistence
 * - Language switcher - uses NEXT_LOCALE cookie for persistence
 * - Brand logo link to home
 *
 * Note: "Go to App" button is NOT shown here because:
 * - Users on sign-in/sign-up pages are typically not authenticated
 * - If they were authenticated, they would be redirected automatically
 *
 * Theme/Language controls are shown here because:
 * - Users should be able to set their preferences before signing in
 * - These settings are the only place outside the app where users can configure them
 *
 * @example
 * // Used in the (login) layout to provide controls on auth pages
 * <AuthHeader />
 */
export function AuthHeader() {
  return (
    <header className="absolute top-0 left-0 right-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        {/* Brand logo - links to home */}
        <Link href="/" className="flex items-center">
          <CircleIcon className="h-6 w-6 text-orange-500" />
          <span className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
            ACME
          </span>
        </Link>

        {/* Theme and Language controls */}
        <div className="flex items-center space-x-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
