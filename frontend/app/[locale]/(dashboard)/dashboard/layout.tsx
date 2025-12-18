"use client";

import { SidebarNav } from "@/components/sidebar-nav";
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

function DashboardSidebar() {
  const t = useTranslations("dashboard");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center">
          <span className="font-semibold text-lg">{t("navigation")}</span>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarNav items={navigationConfig} />
      </SidebarContent>
    </Sidebar>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AudioPlaybackProvider>
      <SidebarProvider>
        <DashboardSidebar />
        <SidebarInset>
          <div className="flex flex-col h-screen">
            <div className="flex items-center gap-2 border-b px-4 py-3 md:hidden flex-shrink-0">
              <SidebarTrigger />
            </div>
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AudioPlaybackProvider>
  );
}
