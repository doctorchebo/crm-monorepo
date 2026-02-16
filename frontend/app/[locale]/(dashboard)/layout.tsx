"use client";

import { ChatNotificationsProvider } from "@/hooks/use-chat-notifications";

/**
 * Dashboard Layout - Layout wrapper for all dashboard and app pages
 *
 * This layout provides:
 * - Chat notifications context for real-time notification handling
 *
 * Note: The header has been removed from app pages.
 * - Theme and language settings are now accessible via the sidebar user profile menu
 * - The main Header component only shows on the landing page (root)
 * - Auth pages use AuthHeader instead
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ChatNotificationsProvider>
      <section className="flex flex-col h-screen">
        <div className="flex-1 overflow-auto">{children}</div>
      </section>
    </ChatNotificationsProvider>
  );
}
