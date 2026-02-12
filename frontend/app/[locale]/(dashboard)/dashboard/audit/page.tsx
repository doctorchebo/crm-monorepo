"use client";

import { AuditLogPanel } from "@/components/audit/audit-log-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageLayout } from "@/components/ui/page-layout";
import { useAuthProtection } from "@/hooks/use-auth";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AuditHistoryPage() {
  const t = useTranslations("audit");
  useAuthProtection();
  const { isAdminOrOwner, isLoading: roleLoading } = useCurrentUserRole();

  return (
    <PageLayout title={t("title")} description={t("description")}>
      {!roleLoading && !isAdminOrOwner && (
        <Alert variant="default" className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription>{t("ownActivityOnly")}</AlertDescription>
        </Alert>
      )}
      <div className="h-[calc(100vh-200px)]">
        <AuditLogPanel showHeader={true} asCard={true} />
      </div>
    </PageLayout>
  );
}
