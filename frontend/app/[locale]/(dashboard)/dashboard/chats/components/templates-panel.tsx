"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader } from "lucide-react";
import type { Template } from "../types";

interface TemplatesPanelProps {
  templates: Template[];
  templatesLoading: boolean;
  templateSearch: string;
  setTemplateSearch: (value: string) => void;
  onApplyTemplate: (template: Template) => void;
  t: (key: string) => string;
}

export function TemplatesPanel({
  templates,
  templatesLoading,
  templateSearch,
  setTemplateSearch,
  onApplyTemplate,
  t,
}: TemplatesPanelProps) {
  // Filter templates based on search
  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  return (
    <div
      className="border-t p-3 bg-muted/30 flex flex-col overflow-hidden flex-shrink-0"
      style={{ maxHeight: "160px" }}
    >
      {templatesLoading ? (
        <>
          <div className="mb-2 space-y-1 flex-shrink-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("availableTemplates")}
            </p>
            <Input
              placeholder={t("searchTemplates")}
              className="h-7 text-xs"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-center py-2">
            <Loader className="h-4 w-4 animate-spin" />
          </div>
        </>
      ) : Array.isArray(filteredTemplates) && filteredTemplates.length > 0 ? (
        <>
          <div className="mb-2 space-y-1 flex-shrink-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("availableTemplates")}
            </p>
            <Input
              placeholder={t("searchTemplates")}
              className="h-7 text-xs"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-1 overflow-y-auto">
            {filteredTemplates.map((template) => (
              <Button
                key={template.id}
                variant="outline"
                size="sm"
                onClick={() => onApplyTemplate(template)}
                className="text-left justify-start h-auto py-1 px-2 text-xs"
              >
                <span className="truncate">{template.name}</span>
              </Button>
            ))}
          </div>
        </>
      ) : templateSearch ? (
        <>
          <div className="mb-2 space-y-1 flex-shrink-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("availableTemplates")}
            </p>
            <Input
              placeholder={t("searchTemplates")}
              className="h-7 text-xs"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground py-1">
            No templates match your search.
          </p>
        </>
      ) : (
        <>
          <div className="mb-2 space-y-1 flex-shrink-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("availableTemplates")}
            </p>
            <Input
              placeholder={t("searchTemplates")}
              className="h-7 text-xs"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground py-1">
            {t("noTemplatesAvailable")}
          </p>
        </>
      )}
    </div>
  );
}
