"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

/**
 * Individual setting item with title, description, and a control (switch, etc.)
 */
export interface SettingItemProps {
  /** Setting title */
  title: string;
  /** Setting description */
  description?: string;
  /** Control element (e.g., Switch, Select, Input) */
  children: ReactNode;
  /** Additional className */
  className?: string;
}

export function SettingItem({
  title,
  description,
  children,
  className,
}: SettingItemProps) {
  return (
    <div
      className={cn("flex items-center justify-between gap-4 py-4", className)}
    >
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium leading-none">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/**
 * Switch setting item - convenience component for toggle settings
 */
export interface SwitchSettingProps {
  /** Setting title */
  title: string;
  /** Setting description */
  description?: string;
  /** Whether the switch is checked */
  checked: boolean;
  /** Callback when switch state changes */
  onCheckedChange: (checked: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Unique ID for the switch */
  id?: string;
}

export function SwitchSetting({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  id,
}: SwitchSettingProps) {
  return (
    <SettingItem title={title} description={description}>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </SettingItem>
  );
}

/**
 * Settings category/section with title and grouped settings
 */
export interface SettingsCategoryProps {
  /** Category title */
  title: string;
  /** Category description (optional) */
  description?: string;
  /** Settings items to render inside the category */
  children: ReactNode;
  /** Additional className */
  className?: string;
}

export function SettingsCategory({
  title,
  description,
  children,
  className,
}: SettingsCategoryProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="divide-y">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Settings page container with title and description
 */
export interface SettingsPageProps {
  /** Page title */
  title: string;
  /** Page description (optional) */
  description?: string;
  /** Page content */
  children: ReactNode;
  /** Additional className */
  className?: string;
}

export function SettingsPage({
  title,
  description,
  children,
  className,
}: SettingsPageProps) {
  return (
    <section className={cn("flex-1 p-4 lg:p-8", className)}>
      <div className="mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
