"use client";

import { useTranslations } from "next-intl";
import { TemplateForm } from "../form";

export default function NewTemplatePage() {
  const t = useTranslations("templates");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">
          {t("createNew") || "Create New Template"}
        </h1>
        <p className="text-gray-600 mt-2">
          {t("createNewDescription") ||
            "Create a new message template with variables and multi-language support"}
        </p>
      </div>

      <TemplateForm />
    </div>
  );
}
