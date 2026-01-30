"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";
import {
  Check,
  Globe,
  Monitor,
  Moon,
  Palette,
  Settings,
  Sun,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Available languages for the language selector
 */
const languages = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Español", flag: "🇪🇸" },
];

/**
 * Settings sections for the sidebar
 */
type SettingsSection = "general";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * SettingsModal - A modal dialog with its own sidebar for configuration sections.
 *
 * Currently supports:
 * - General settings:
 *   - Theme (light/dark/system)
 *   - Language (English/Spanish)
 *
 * This component is designed to be extended with additional sections
 * such as account, notifications, security, etc.
 */
export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const t = useTranslations("settings");
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");

  const sections: {
    id: SettingsSection;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "general",
      label: t("general"),
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex h-[500px]">
          {/* Settings Sidebar */}
          <div className="w-48 border-r bg-muted/30 p-4 flex flex-col gap-1">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-lg">{t("title")}</DialogTitle>
              <DialogDescription className="sr-only">
                {t("generalDescription")}
              </DialogDescription>
            </DialogHeader>
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
                  activeSection === section.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {section.icon}
                {section.label}
              </button>
            ))}
          </div>

          {/* Settings Content */}
          <div className="flex-1 p-6 overflow-auto">
            {activeSection === "general" && <GeneralSettings />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * GeneralSettings - Theme and Language configuration
 */
function GeneralSettings() {
  const t = useTranslations("settings");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("general")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("generalDescription")}
        </p>
      </div>
      <Separator />
      <ThemeSelector />
      <Separator />
      <LanguageSelector />
    </div>
  );
}

/**
 * ThemeSelector - Component for selecting light/dark/system theme
 */
function ThemeSelector() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();

  const themes = [
    { id: "light", label: t("themeLight"), icon: <Sun className="h-4 w-4" /> },
    { id: "dark", label: t("themeDark"), icon: <Moon className="h-4 w-4" /> },
    {
      id: "system",
      label: t("themeSystem"),
      icon: <Monitor className="h-4 w-4" />,
    },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">{t("theme")}</Label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {themes.map((themeOption) => (
          <button
            key={themeOption.id}
            onClick={() => setTheme(themeOption.id)}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors",
              theme === themeOption.id
                ? "border-primary bg-primary/5"
                : "border-transparent bg-muted/50 hover:bg-muted",
            )}
          >
            {themeOption.icon}
            <span className="text-xs font-medium">{themeOption.label}</span>
            {theme === themeOption.id && (
              <Check className="h-3 w-3 text-primary" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * LanguageSelector - Component for selecting application language
 */
function LanguageSelector() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleLanguageChange = (newLocale: string) => {
    if (newLocale === locale) return;

    startTransition(() => {
      // Save locale preference to cookie
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;

      // Remove the current locale prefix from pathname
      const pathWithoutLocale = pathname.replace(/^\/(en|es)/, "") || "/";

      // Construct new path with new locale
      const newPath =
        newLocale === "en"
          ? pathWithoutLocale
          : `/${newLocale}${pathWithoutLocale}`;

      // Preserve query parameters
      const params = searchParams.toString();
      const finalPath = params ? `${newPath}?${params}` : newPath;

      router.replace(finalPath);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">{t("language")}</Label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            disabled={isPending}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border-2 transition-colors",
              locale === lang.code
                ? "border-primary bg-primary/5"
                : "border-transparent bg-muted/50 hover:bg-muted",
              isPending && "opacity-50 cursor-not-allowed",
            )}
          >
            <span className="text-xl">{lang.flag}</span>
            <span className="text-sm font-medium">{lang.name}</span>
            {locale === lang.code && (
              <Check className="h-4 w-4 text-primary ml-auto" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
