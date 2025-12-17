"use client";

/**
 * Chat Message Input Component
 * A memoized component that manages message input state internally
 * to prevent re-rendering the entire parent component on every keystroke.
 */

import { Button } from "@/components/ui/button";
import { MessageInput } from "@/components/ui/message-input";
import { Send } from "lucide-react";
import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface ChatMessageInputRef {
  focus: () => void;
  clear: () => void;
  setValue: (value: string) => void;
  getValue: () => string;
}

interface ChatMessageInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  leftElement?: React.ReactNode;
  templateValue?: string;
  onTemplateUsed?: () => void;
}

export const ChatMessageInput = memo(
  forwardRef<ChatMessageInputRef, ChatMessageInputProps>(
    function ChatMessageInput(
      {
        onSend,
        placeholder,
        disabled = false,
        leftElement,
        templateValue,
        onTemplateUsed,
      },
      ref
    ) {
      const [localValue, setLocalValue] = useState("");
      const inputRef = useRef<{ focus: () => void }>(null);

      // Expose methods to parent
      useImperativeHandle(ref, () => ({
        focus: () => {
          inputRef.current?.focus();
        },
        clear: () => {
          setLocalValue("");
        },
        setValue: (value: string) => {
          setLocalValue(value);
        },
        getValue: () => localValue,
      }));

      const handleChange = useCallback(
        (value: string) => {
          // If template was being displayed and user types, clear template
          if (templateValue && onTemplateUsed) {
            onTemplateUsed();
          }
          setLocalValue(value);
        },
        [templateValue, onTemplateUsed]
      );

      const handleSend = useCallback(() => {
        // Use template value if available, otherwise use local value
        const valueToSend = templateValue || localValue;
        const trimmed = valueToSend.trim();
        if (trimmed) {
          onSend(trimmed);
          setLocalValue("");
          if (templateValue && onTemplateUsed) {
            onTemplateUsed();
          }
        }
      }, [localValue, templateValue, onSend, onTemplateUsed]);

      const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        },
        [handleSend]
      );

      // Display template value if available, otherwise show local value
      const displayValue = templateValue || localValue;
      const canSend = displayValue.trim().length > 0;

      return (
        <MessageInput
          ref={inputRef}
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxRows={5}
          leftElement={leftElement}
          rightElement={
            <Button
              onClick={handleSend}
              disabled={!canSend || disabled}
              size="sm"
              className="h-8"
            >
              <Send className="h-4 w-4" />
            </Button>
          }
        />
      );
    }
  )
);

ChatMessageInput.displayName = "ChatMessageInput";
