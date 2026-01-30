"use client";

import { Header } from "@/components/header";
import { Suspense } from "react";

/**
 * Marketing Layout - Layout for public marketing pages (landing page, etc.)
 *
 * This layout provides:
 * - Header with brand logo, user actions (sign in/sign up or go to app)
 * - NO theme/language toggles (available in settings modal within app)
 *
 * Pages using this layout:
 * - Landing page (/)
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col min-h-screen">
      <Suspense
        fallback={
          <div className="border-b border-gray-200 dark:border-gray-800 h-16" />
        }
      >
        <Header />
      </Suspense>
      {children}
    </section>
  );
}
