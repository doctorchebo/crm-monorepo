"use client";

import { PageLayout } from "@/components/ui/page-layout";
import { useAuthProtection } from "@/hooks/use-auth";
import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  useAuthProtection();

  return (
    <PageLayout title={t("dashboard")}>
      <div className="text-muted-foreground text-center py-16">
        {t("dashboardWelcome")}
      </div>
    </PageLayout>
  );
}
