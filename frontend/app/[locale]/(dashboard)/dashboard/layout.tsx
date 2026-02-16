"use client";

import { EmojiPickerProvider } from "@/components/emoji-picker";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarUserProfile } from "@/components/sidebar-user-profile";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AudioPlaybackProvider } from "@/lib/audio-playback-context";
import { navigationConfig } from "@/lib/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * DashboardSidebar - Main navigation sidebar for the dashboard
 *
 * Contains:
 * - Brand logo and app name in the header
 * - Navigation menu items
 * - User profile with settings and logout at the bottom
 */
function DashboardSidebar() {
  const t = useTranslations("dashboard");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Wappify CRM"
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded"
          />
          <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">
            Wappify CRM
          </span>
        </Link>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarNav items={navigationConfig} />
      </SidebarContent>
      <SidebarUserProfile />
    </Sidebar>
  );
}

/**
 * DashboardLayout - Layout wrapper for all dashboard pages
 *
 * Provides:
 * - Audio playback context for media handling
 * - Emoji picker context for chat functionality
 * - Sidebar navigation with user profile
 * - Responsive mobile trigger
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AudioPlaybackProvider>
      <EmojiPickerProvider>
        <SidebarProvider>
          <DashboardSidebar />
          <SidebarInset>
            <div className="flex flex-col h-screen">
              <div className="flex items-center gap-2 border-b px-4 py-3 md:hidden flex-shrink-0">
                <SidebarTrigger />
              </div>
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </EmojiPickerProvider>
    </AudioPlaybackProvider>
  );
}
