"use client";

/**
 * Message Text Component
 * Renders message text with:
 * - Clickable links with proper styling
 * - Link previews for URLs
 * - Word-break for long URLs to prevent overflow
 */

import { extractUrls, URL_REGEX } from "@/lib/link-preview";
import React, { useMemo } from "react";
import { LinkPreview } from "./link-preview";

interface MessageTextProps {
  text: string;
  isOutbound?: boolean;
  showPreviews?: boolean;
  maxPreviews?: number;
  onVideoPlay?: (videoId: string, url: string) => void;
}

interface TextPart {
  type: "text" | "link";
  content: string;
}

export function MessageText({
  text,
  isOutbound = false,
  showPreviews = true,
  maxPreviews = 1,
  onVideoPlay,
}: MessageTextProps) {
  // Parse text into segments (text and links)
  const parts = useMemo(() => {
    const result: TextPart[] = [];
    let lastIndex = 0;

    // Reset regex state
    URL_REGEX.lastIndex = 0;

    let match;
    while ((match = URL_REGEX.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        result.push({
          type: "text",
          content: text.slice(lastIndex, match.index),
        });
      }

      // Add the URL
      result.push({
        type: "link",
        content: match[0],
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      result.push({
        type: "text",
        content: text.slice(lastIndex),
      });
    }

    return result;
  }, [text]);

  // Extract unique URLs for previews
  const urls = useMemo(() => {
    const extracted = extractUrls(text);
    return extracted.slice(0, maxPreviews);
  }, [text, maxPreviews]);

  const hasLinks = parts.some((part) => part.type === "link");

  return (
    <div className="message-text">
      {/* Link Previews - shown at top */}
      {showPreviews && urls.length > 0 && (
        <div className="link-previews mb-1">
          {urls.map((url, index) => (
            <LinkPreview
              key={`${url}-${index}`}
              url={url}
              isOutbound={isOutbound}
              onVideoPlay={onVideoPlay}
            />
          ))}
        </div>
      )}

      {/* Render text with clickable links - shown at bottom */}
      <p
        className={`text-xs whitespace-pre-wrap ${
          hasLinks ? "break-all" : "break-words"
        }`}
      >
        {parts.map((part, index) => {
          if (part.type === "link") {
            return (
              <a
                key={index}
                href={part.content}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`underline hover:no-underline transition-all ${
                  isOutbound
                    ? "text-primary-foreground hover:text-primary-foreground/80"
                    : "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                }`}
              >
                {part.content}
              </a>
            );
          }
          return <React.Fragment key={index}>{part.content}</React.Fragment>;
        })}
      </p>
    </div>
  );
}
