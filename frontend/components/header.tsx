"use client";

import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Suspense } from "react";

/**
 * UserActions - Shows appropriate actions based on authentication state
 *
 * When authenticated: Shows "Go to App" button
 * When not authenticated: Shows sign in and sign up links
 */
function UserActions() {
  const t = useTranslations("header");
  const { user, isLoading } = useUser();

  // Show loading state briefly
  if (isLoading) {
    return <div className="h-9 w-20" />;
  }

  if (user) {
    return (
      <Button asChild className="rounded-full">
        <Link href="/dashboard">
          {t("goToApp")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    );
  }

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

/**
 * Header component for public marketing pages (landing page, pricing).
 *
 * Includes:
 * - Brand logo and name
 * - Conditional user actions:
 *   - Authenticated: "Go to App" button to navigate to dashboard
 *   - Not authenticated: Pricing, Sign in, Sign up links
 *
 * Note: Theme/Language settings are NOT shown here.
 * - For app users: accessible via sidebar profile menu → Settings modal
 * - For auth pages: shown in AuthHeader
 */
export function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <img
            src="/logo.png"
            alt="Wappify CRM"
            width={24}
            height={24}
            className="h-6 w-6 rounded"
          />
          <span className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
            Wappify CRM
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          <Suspense fallback={<div className="h-9 w-20" />}>
            <UserActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
