"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { TemplateForm } from "../../form";

export default function EditTemplatePage() {
  const t = useTranslations("templates");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const templateId = params.templateId as string;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-6 p-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${locale}/dashboard/templates`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-black dark:text-white">
              {t("edit") || "Edit Template"}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {t("editDescription") || "Update your message template"}
            </p>
          </div>
        </div>

        <TemplateForm templateId={templateId} />
      </div>
    </div>
  );
}
