"use client";

import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Activity,
  FileText,
  Home,
  LayoutGrid,
  MessageSquare,
  Send,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

function DashboardSidebar() {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  const navItems = [
    { href: "/dashboard", icon: Home, label: t("home") },
    { href: "/dashboard/chats", icon: MessageSquare, label: t("chats") },
    { href: "/dashboard/contacts", icon: Users, label: t("contacts") },
    { href: "/dashboard/templates", icon: FileText, label: t("templates") },
    { href: "/dashboard/senders", icon: Send, label: t("senders") },
    { href: "/dashboard/kanban", icon: LayoutGrid, label: t("kanban") },
    { href: "/dashboard/team", icon: Users, label: t("team") },
    { href: "/dashboard/general", icon: Settings, label: t("general") },
    { href: "/dashboard/activity", icon: Activity, label: t("activity") },
    { href: "/dashboard/security", icon: Shield, label: t("security") },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center">
          <span className="font-semibold text-lg">{t("navigation")}</span>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                className="cursor-pointer"
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
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
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <SidebarTrigger />
          </div>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
