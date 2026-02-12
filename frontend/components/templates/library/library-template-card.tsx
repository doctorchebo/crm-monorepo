"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TemplateLibraryTemplateWithStatus } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Globe,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Locale display names for library template languages
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  en_US: "English (US)",
  en_GB: "English (UK)",
  es: "Spanish",
  es_ES: "Spanish (Spain)",
  es_MX: "Spanish (Mexico)",
  es_AR: "Spanish (Argentina)",
  pt_BR: "Portuguese (Brazil)",
  pt_PT: "Portuguese (Portugal)",
  fr: "French",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh_CN: "Chinese (Simplified)",
  zh_TW: "Chinese (Traditional)",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
  id: "Indonesian",
  ms: "Malay",
  th: "Thai",
  vi: "Vietnamese",
};

/**
 * Get human-readable language name from a locale code
 */
function getLanguageDisplayName(lang: string): string {
  return LANGUAGE_DISPLAY_NAMES[lang] || lang.replace("_", " ").toUpperCase();
}

/**
 * Format a use case enum value into a readable label
 * e.g. "ORDER_CONFIRMATION" → "Order Confirmation"
 */
function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Highlight {{1}}, {{2}}, etc. placeholders in template body text
 */
function renderBodyWithParams(
  body: string,
  paramTypes: string[],
): React.ReactNode {
  const parts = body.split(/(\{\{\d+\}\})/g);
  return parts.map((part, i) => {
    const match = part.match(/\{\{(\d+)\}\}/);
    if (match) {
      const index = parseInt(match[1], 10) - 1;
      const paramType = paramTypes[index];
      return (
        <TooltipProvider key={i}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1 rounded text-xs font-mono">
                {part}
              </span>
            </TooltipTrigger>
            {paramType && (
              <TooltipContent>
                <p className="text-xs">{formatEnumLabel(paramType)}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface LibraryTemplateCardProps {
  /** The library template data (enriched with adoption status) */
  template: TemplateLibraryTemplateWithStatus;
  /** Handler for the "Use Template" action */
  onAdopt: (template: TemplateLibraryTemplateWithStatus) => void;
}

/**
 * Card component for displaying a single template from Meta's Template Library.
 * Shows template preview, metadata, and adoption status.
 */
export function LibraryTemplateCard({
  template,
  onAdopt,
}: LibraryTemplateCardProps) {
  const t = useTranslations("templates.library");
  const [isExpanded, setIsExpanded] = useState(false);

  const bodyText = template.body || "";
  const isLongBody = bodyText.length > 120;
  const displayBody =
    isLongBody && !isExpanded ? bodyText.substring(0, 120) + "..." : bodyText;

  return (
    <Card
      className={cn(
        "p-4 transition-shadow hover:shadow-lg flex flex-col h-full",
        template.adopted &&
          "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10",
      )}
    >
      {/* Header: Name + Language */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-tight truncate">
            {formatEnumLabel(template.name)}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Globe className="h-3 w-3 shrink-0" />
            <span>{getLanguageDisplayName(template.language)}</span>
          </div>
        </div>
        {template.adopted && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="default"
                  className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 shrink-0"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {t("adopted")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{t("adoptedTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Metadata badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge variant="outline" className="text-xs">
          {formatEnumLabel(template.category)}
        </Badge>
        {template.topic && (
          <Badge variant="secondary" className="text-xs">
            <Tag className="h-3 w-3 mr-1" />
            {formatEnumLabel(template.topic)}
          </Badge>
        )}
      </div>

      {/* Template body preview */}
      <div className="flex-1 mb-3">
        {template.header && (
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            {template.header}
          </p>
        )}
        <p className="text-sm text-foreground leading-relaxed">
          {renderBodyWithParams(displayBody, template.body_param_types || [])}
        </p>
        {isLongBody && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 flex items-center gap-0.5"
          >
            {isExpanded ? (
              <>
                {t("showLess")} <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                {t("showMore")} <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
        {template.footer && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            {template.footer}
          </p>
        )}
      </div>

      {/* Buttons preview (if any) */}
      {template.buttons && template.buttons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {template.buttons.map((btn, i) => (
            <Badge
              key={i}
              variant="outline"
              className="text-xs bg-blue-50 dark:bg-blue-950/20"
            >
              {btn.text || btn.type}
            </Badge>
          ))}
        </div>
      )}

      {/* Parameters info */}
      {template.body_params && template.body_params.length > 0 && (
        <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
          <span>{t("paramCount", { count: template.body_params.length })}</span>
        </div>
      )}

      {/* Action */}
      <div className="mt-auto pt-2 border-t">
        <Button
          variant={template.adopted ? "outline" : "default"}
          size="sm"
          className="w-full gap-2"
          onClick={() => onAdopt(template)}
          disabled={template.adopted}
        >
          {template.adopted ? (
            <>
              <CheckCircle className="h-4 w-4" />
              {t("alreadyAdopted")}
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              {t("useTemplate")}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
