"use client";

/**
 * Chat Message Input Component
 * A memoized component that manages message input state internally
 * to prevent re-rendering the entire parent component on every keystroke.
 * Includes voice recording capability with inline UI.
 */

import { Button } from "@/components/ui/button";
import { MessageInput } from "@/components/ui/message-input";
import { VoiceRecorderUI } from "@/components/voice-recorder-ui";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { Mic, Send } from "lucide-react";
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
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
  onSendVoiceNote?: (
    audioBlob: Blob,
    duration: number,
    waveformData: number[]
  ) => void;
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
        onSendVoiceNote,
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

      // Voice recording state
      const recorder = useAudioRecorder();
      const isRecordingMode =
        recorder.isRecording || recorder.audioBlob !== null;

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

      // Handle mic button click - start recording
      const handleMicClick = useCallback(async () => {
        if (recorder.hasPermission === null) {
          const granted = await recorder.requestPermission();
          if (granted) {
            recorder.startRecording();
          }
        } else if (recorder.hasPermission) {
          recorder.startRecording();
        } else {
          // Permission was previously denied, try again
          await recorder.requestPermission();
        }
      }, [recorder]);

      // Handle sending voice note (when blob is already ready)
      const handleSendVoiceNote = useCallback(() => {
        if (recorder.audioBlob && onSendVoiceNote) {
          onSendVoiceNote(
            recorder.audioBlob,
            recorder.duration,
            recorder.waveformData
          );
          recorder.resetRecording();
        }
      }, [recorder, onSendVoiceNote]);

      // Auto-send when pendingSend is true and audioBlob is ready
      useEffect(() => {
        if (recorder.pendingSend && recorder.audioBlob && onSendVoiceNote) {
          onSendVoiceNote(
            recorder.audioBlob,
            recorder.duration,
            recorder.waveformData
          );
          recorder.resetRecording();
        }
      }, [recorder.pendingSend, recorder.audioBlob, recorder, onSendVoiceNote]);

      // Display template value if available, otherwise show local value
      const displayValue = templateValue || localValue;
      const canSend = displayValue.trim().length > 0;

      // If in recording mode, show the voice recorder UI
      if (isRecordingMode) {
        return (
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-2 py-1.5 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            {leftElement && (
              <div className="flex-shrink-0 flex items-center">
                {leftElement}
              </div>
            )}
            <VoiceRecorderUI
              recorderState={recorder}
              onPause={recorder.pauseRecording}
              onResume={recorder.resumeRecording}
              onStop={recorder.stopRecording}
              onStopAndSend={recorder.stopAndSend}
              onCancel={recorder.cancelRecording}
              onSend={handleSendVoiceNote}
              className="flex-1"
            />
          </div>
        );
      }

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
            canSend ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleSend}
                disabled={disabled}
              >
                <Send className="h-4 w-4" />
              </Button>
            ) : onSendVoiceNote && !isRecordingMode ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleMicClick}
                disabled={disabled}
              >
                <Mic className="h-4 w-4" />
              </Button>
            ) : null
          }
        />
      );
    }
  )
);

ChatMessageInput.displayName = "ChatMessageInput";
