import { cn } from "@/lib/utils";
import React from "react";

interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /**
   * Title of the page to be displayed in the header area (optional)
   */
  title?: string;
  /**
   * Description or subtitle for the page (optional)
   */
  description?: string;
  /**
   * Optional action buttons or content to display in the header
   */
  headerActions?: React.ReactNode;
}

/**
 * PageLayout component used to enforce consistent max-width and internal spacing
 * across configuration pages (Settings, Contacts, etc.).
 *
 * It provides a central container with max-width matching the app header,
 * ensuring harmony in the layout.
 */
export function PageLayout({
  children,
  className,
  title,
  description,
  headerActions,
  ...props
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        "w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6",
        className
      )}
      {...props}
    >
      {(title || description || headerActions) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {headerActions && <div>{headerActions}</div>}
        </div>
      )}
      <div className="w-full">{children}</div>
    </div>
  );
}
