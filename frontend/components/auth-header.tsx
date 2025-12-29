"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CircleIcon } from "lucide-react";
import Link from "next/link";

/**
 * AuthHeader - A minimal header component for authentication pages (sign-in, sign-up).
 *
 * This component provides essential functionality that should persist across all pages:
 * - Theme toggle (light/dark/system) - uses localStorage for persistence
 * - Language switcher - uses NEXT_LOCALE cookie for persistence
 * - Brand logo link to home
 *
 * Unlike the main Header component, this doesn't include user-specific elements
 * like the user menu, dashboard links, or sign-out functionality.
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
