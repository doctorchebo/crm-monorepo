"use client";

/**
 * Interactive Buttons Display Component
 *
 * Displays the reply buttons that were sent with an interactive message.
 * These are read-only displays showing what options were presented to the customer.
 */

import { cn } from "@/lib/utils";
import { memo } from "react";
import type {
  InteractiveButton,
  InteractiveListSection,
  MessageMetadata,
} from "../types";

interface InteractiveButtonsDisplayProps {
  metadata: MessageMetadata;
  isOutbound: boolean;
}

/**
 * Displays interactive reply buttons for button-type messages
 */
function ButtonDisplay({
  buttons,
  isOutbound,
}: {
  buttons: InteractiveButton[];
  isOutbound: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-current/10">
      {buttons.map((button, index) => (
        <div
          key={button.id || index}
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-medium text-center",
            "border border-current/20",
            isOutbound
              ? "bg-primary-foreground/10 text-primary-foreground"
              : "bg-muted-foreground/10 text-muted-foreground"
          )}
        >
          {button.title}
        </div>
      ))}
    </div>
  );
}

/**
 * Displays interactive list sections for list-type messages
 */
function ListDisplay({
  sections,
  buttonText,
  isOutbound,
}: {
  sections: InteractiveListSection[];
  buttonText?: string;
  isOutbound: boolean;
}) {
  return (
    <div className="mt-2 pt-2 border-t border-current/10">
      {/* List button indicator */}
      <div
        className={cn(
          "px-3 py-1.5 rounded-md text-[11px] font-medium text-center mb-2",
          "border border-current/20",
          isOutbound
            ? "bg-primary-foreground/10 text-primary-foreground"
            : "bg-muted-foreground/10 text-muted-foreground"
        )}
      >
        {buttonText || "Select an option"}
      </div>

      {/* List sections preview */}
      <div className="space-y-2">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="text-[10px]">
            {section.title && (
              <div
                className={cn(
                  "font-semibold mb-1",
                  isOutbound
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground/70"
                )}
              >
                {section.title}
              </div>
            )}
            <div className="space-y-0.5">
              {section.rows.slice(0, 3).map((row, rowIndex) => (
                <div
                  key={row.id || rowIndex}
                  className={cn(
                    "pl-2",
                    isOutbound
                      ? "text-primary-foreground/60"
                      : "text-muted-foreground/60"
                  )}
                >
                  • {row.title}
                </div>
              ))}
              {section.rows.length > 3 && (
                <div
                  className={cn(
                    "pl-2 italic",
                    isOutbound
                      ? "text-primary-foreground/40"
                      : "text-muted-foreground/40"
                  )}
                >
                  +{section.rows.length - 3} more...
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Footer text display
 */
function FooterDisplay({
  footerText,
  isOutbound,
}: {
  footerText: string;
  isOutbound: boolean;
}) {
  return (
    <div
      className={cn(
        "text-[10px] mt-1 italic",
        isOutbound ? "text-primary-foreground/50" : "text-muted-foreground/50"
      )}
    >
      {footerText}
    </div>
  );
}

/**
 * Main component for displaying interactive message buttons/lists
 */
export const InteractiveButtonsDisplay = memo(
  function InteractiveButtonsDisplay({
    metadata,
    isOutbound,
  }: InteractiveButtonsDisplayProps) {
    const { interactiveType, interactiveData } = metadata;

    // Only render if we have interactive data
    if (!interactiveData) {
      return null;
    }

    const hasButtons =
      interactiveType === "button" &&
      interactiveData.buttons &&
      interactiveData.buttons.length > 0;

    const hasList =
      interactiveType === "list" &&
      interactiveData.sections &&
      interactiveData.sections.length > 0;

    if (!hasButtons && !hasList) {
      return null;
    }

    return (
      <div className="interactive-buttons-display">
        {/* Button type interactive message */}
        {hasButtons && (
          <ButtonDisplay
            buttons={interactiveData.buttons!}
            isOutbound={isOutbound}
          />
        )}

        {/* List type interactive message */}
        {hasList && (
          <ListDisplay
            sections={interactiveData.sections!}
            buttonText={interactiveData.buttonText}
            isOutbound={isOutbound}
          />
        )}

        {/* Footer text */}
        {interactiveData.footerText && (
          <FooterDisplay
            footerText={interactiveData.footerText}
            isOutbound={isOutbound}
          />
        )}
      </div>
    );
  }
);

InteractiveButtonsDisplay.displayName = "InteractiveButtonsDisplay";
