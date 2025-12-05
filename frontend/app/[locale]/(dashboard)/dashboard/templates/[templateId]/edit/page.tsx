"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { TemplateForm } from "../../form";

export default function EditTemplatePage() {
  const t = useTranslations("templates");
  const params = useParams();
  const templateId = params.templateId as string;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{t("edit") || "Edit Template"}</h1>
        <p className="text-gray-600 mt-2">
          {t("editDescription") || "Update your message template"}
        </p>
      </div>

      <TemplateForm templateId={templateId} />
    </div>
  );
}
