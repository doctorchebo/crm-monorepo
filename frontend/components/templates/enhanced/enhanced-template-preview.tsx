"use client";

import { Card } from "@/components/ui/card";
import {
  CarouselCard,
  isLocationHeader,
  isMediaHeader,
  isTextHeader,
  TemplateButton,
  TemplateComponents,
} from "@/lib/types/template-components.types";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Image,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingBag,
  Video,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";

interface EnhancedTemplatePreviewProps {
  /** Template components to preview */
  components: TemplateComponents;
  /** Example variables for rendering */
  exampleVars?: Record<string, string>;
  /** Whether to show in phone frame */
  showPhoneFrame?: boolean;
  /** Template name for display */
  templateName?: string;
}

/**
 * Render variable placeholders with example values
 */
function renderWithVariables(
  text: string,
  exampleVars: Record<string, string> = {},
): string {
  // Handle numbered placeholders {{1}}, {{2}}, etc.
  let rendered = text.replace(/\{\{(\d+)\}\}/g, (match, num) => {
    return exampleVars[num] || `[${num}]`;
  });

  // Handle named placeholders {{customer.name}}, etc.
  rendered = rendered.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    return exampleVars[varName.trim()] || `[${varName.trim()}]`;
  });

  return rendered;
}

/**
 * Get icon for button type
 */
function getButtonIcon(type: TemplateButton["type"]) {
  switch (type) {
    case "URL":
      return ExternalLink;
    case "PHONE_NUMBER":
      return Phone;
    case "QUICK_REPLY":
      return MessageCircle;
    case "COPY_CODE":
      return Copy;
    case "FLOW":
      return Workflow;
    case "CATALOG":
    case "MPM":
    case "SPM":
      return ShoppingBag;
    default:
      return MessageCircle;
  }
}

/**
 * Preview a single button
 */
function ButtonPreview({ button }: { button: TemplateButton }) {
  const Icon = getButtonIcon(button.type);
  const isQuickReply = button.type === "QUICK_REPLY";

  return (
    <button
      className={`
        flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium
        transition-colors
        ${
          isQuickReply
            ? "bg-white border border-gray-300 text-gray-700 rounded-full hover:bg-gray-50"
            : "bg-[#25D366]/10 text-[#25D366] rounded-lg hover:bg-[#25D366]/20 w-full"
        }
      `}
    >
      <Icon className="h-4 w-4" />
      <span>{button.text || "Button"}</span>
    </button>
  );
}

/**
 * Preview header content
 */
function HeaderPreview({
  components,
  exampleVars,
}: {
  components: TemplateComponents;
  exampleVars: Record<string, string>;
}) {
  const { header } = components;
  if (!header) return null;

  if (isTextHeader(header)) {
    return (
      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {renderWithVariables(header.text, exampleVars)}
      </div>
    );
  }

  if (isMediaHeader(header)) {
    const isImage = header.format === "IMAGE";
    const isVideo = header.format === "VIDEO";
    const isDoc = header.format === "DOCUMENT";

    return (
      <div className="mb-3 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
        {isImage && header.url ? (
          <img
            src={header.url}
            alt="Header"
            className="w-full h-40 object-cover"
            onError={(e) => {
              console.error("[TemplatePreview] Image failed to load:", {
                url: header.url,
                filename: header.filename,
              });
            }}
          />
        ) : isVideo && header.url ? (
          <video
            src={header.url}
            className="w-full h-40 object-cover"
            controls
          />
        ) : isDoc ? (
          // For documents, show thumbnail if available, otherwise show icon
          header.thumbnailUrl ? (
            <div className="relative">
              <img
                src={header.thumbnailUrl}
                alt={header.filename || "Document thumbnail"}
                className="w-full h-40 object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {header.filename || "Document"}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4">
              <FileText className="h-8 w-8 text-gray-500" />
              <span className="text-sm text-gray-600">
                {header.filename || "Document"}
              </span>
            </div>
          )
        ) : (
          <div className="h-40 flex items-center justify-center">
            {isImage && <Image className="h-12 w-12 text-gray-400" />}
            {isVideo && <Video className="h-12 w-12 text-gray-400" />}
            {isDoc && <FileText className="h-12 w-12 text-gray-400" />}
          </div>
        )}
      </div>
    );
  }

  if (isLocationHeader(header)) {
    return (
      <div className="mb-3 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 p-4">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <MapPin className="h-5 w-5" />
          <div>
            {header.name && (
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {header.name}
              </p>
            )}
            {header.address && <p className="text-sm">{header.address}</p>}
            {header.latitude && header.longitude && (
              <p className="text-xs">
                {header.latitude.toFixed(6)}, {header.longitude.toFixed(6)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Preview carousel cards
 */
function CarouselPreview({
  cards,
  exampleVars,
}: {
  cards: CarouselCard[];
  exampleVars: Record<string, string>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!cards || cards.length === 0) return null;

  const activeCard = cards[activeIndex];

  return (
    <div className="space-y-3">
      {/* Card display */}
      <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Card media */}
        <div className="h-32 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          {activeCard.header.url ? (
            activeCard.header.format === "IMAGE" ? (
              <img
                src={activeCard.header.url}
                alt={`Card ${activeIndex + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={activeCard.header.url}
                className="w-full h-full object-cover"
              />
            )
          ) : activeCard.header.format === "IMAGE" ? (
            <Image className="h-10 w-10 text-gray-400" />
          ) : (
            <Video className="h-10 w-10 text-gray-400" />
          )}
        </div>

        {/* Card content */}
        <div className="p-3">
          <p className="text-sm text-gray-900 dark:text-gray-100">
            {renderWithVariables(activeCard.body.text, exampleVars)}
          </p>

          {/* Card buttons */}
          {activeCard.buttons && activeCard.buttons.length > 0 && (
            <div className="mt-3 space-y-2">
              {activeCard.buttons.map((button, idx) => (
                <ButtonPreview key={idx} button={button} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card navigation */}
      {cards.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            disabled={activeIndex === 0}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1">
            {cards.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`
                  h-1.5 rounded-full transition-all
                  ${idx === activeIndex ? "w-4 bg-primary" : "w-1.5 bg-gray-300"}
                `}
              />
            ))}
          </div>
          <button
            onClick={() =>
              setActiveIndex(Math.min(cards.length - 1, activeIndex + 1))
            }
            disabled={activeIndex === cards.length - 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * EnhancedTemplatePreview Component
 *
 * Renders a realistic preview of a WhatsApp template message
 * including headers, body, footer, buttons, and carousels.
 */
export function EnhancedTemplatePreview({
  components,
  exampleVars = {},
  showPhoneFrame = true,
  templateName,
}: EnhancedTemplatePreviewProps) {
  const renderedBody = useMemo(() => {
    return renderWithVariables(components.body.text, exampleVars);
  }, [components.body.text, exampleVars]);

  // Separate quick replies from other buttons
  const quickReplies = components.buttons?.filter(
    (b) => b.type === "QUICK_REPLY",
  );
  const actionButtons = components.buttons?.filter(
    (b) => b.type !== "QUICK_REPLY",
  );

  const messageContent = (
    <div className="space-y-3">
      {/* Header */}
      <HeaderPreview components={components} exampleVars={exampleVars} />

      {/* Body */}
      <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
        {renderedBody || (
          <span className="text-gray-400 italic">No message body</span>
        )}
      </div>

      {/* Footer */}
      {components.footer && (
        <div className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-2">
          {components.footer.text}
        </div>
      )}

      {/* Limited Time Offer */}
      {components.limitedTimeOffer && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
          <span>⏰</span>
          <span>
            {components.limitedTimeOffer.text || "Limited time offer"}
          </span>
        </div>
      )}

      {/* Carousel */}
      {components.carousel && components.carousel.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <CarouselPreview
            cards={components.carousel}
            exampleVars={exampleVars}
          />
        </div>
      )}

      {/* Action buttons (URL, Phone, etc.) */}
      {actionButtons && actionButtons.length > 0 && (
        <div className="space-y-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {actionButtons.map((button, idx) => (
            <ButtonPreview key={idx} button={button} />
          ))}
        </div>
      )}

      {/* Quick replies */}
      {quickReplies && quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {quickReplies.map((button, idx) => (
            <ButtonPreview key={idx} button={button} />
          ))}
        </div>
      )}
    </div>
  );

  if (!showPhoneFrame) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-900">{messageContent}</Card>
    );
  }

  // Phone frame mockup
  return (
    <div className="relative mx-auto" style={{ maxWidth: "320px" }}>
      {/* Phone frame */}
      <div className="bg-gray-900 rounded-[2.5rem] p-2 shadow-2xl">
        {/* Screen */}
        <div className="bg-[#ECE5DD] dark:bg-[#0B141A] rounded-[2rem] overflow-hidden">
          {/* Status bar */}
          <div className="h-6 bg-[#075E54] dark:bg-[#202C33] flex items-center justify-center">
            <span className="text-xs text-white/80">WhatsApp</span>
          </div>

          {/* Chat header */}
          <div className="h-14 bg-[#075E54] dark:bg-[#202C33] flex items-center gap-3 px-4">
            <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div>
              <p className="text-sm font-medium text-white">
                {templateName || "Business"}
              </p>
              <p className="text-xs text-white/70">Template Preview</p>
            </div>
          </div>

          {/* Message area */}
          <div
            className="p-4 min-h-[300px]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            {/* Message bubble */}
            <div className="relative bg-white dark:bg-[#202C33] rounded-lg shadow-sm p-3 max-w-[85%]">
              {/* Triangle pointer */}
              <div className="absolute -left-2 top-0 w-0 h-0 border-t-8 border-t-white dark:border-t-[#202C33] border-l-8 border-l-transparent" />
              {messageContent}
              {/* Timestamp */}
              <div className="text-right mt-1">
                <span className="text-[10px] text-gray-400">12:00 PM</span>
              </div>
            </div>
          </div>

          {/* Input bar mockup */}
          <div className="h-14 bg-[#F0F2F5] dark:bg-[#202C33] flex items-center gap-2 px-4">
            <div className="flex-1 h-10 bg-white dark:bg-[#2A3942] rounded-full" />
            <div className="h-10 w-10 rounded-full bg-[#25D366] flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnhancedTemplatePreview;
