"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";

export interface PasswordInputProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  /** Label for accessibility when showing password */
  showLabel?: string;
  /** Label for accessibility when hiding password */
  hideLabel?: string;
}

/**
 * Password input component with visibility toggle
 * Displays an eye icon button to show/hide password text
 */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      showLabel = "Show password",
      hideLabel = "Hide password",
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          className={cn("pr-10", className)}
          ref={ref}
          disabled={disabled}
          {...props}
        />
        <button
          type="button"
          className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors",
            disabled && "pointer-events-none opacity-50"
          )}
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? hideLabel : showLabel}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
