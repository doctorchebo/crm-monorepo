import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Search, X } from "lucide-react";
import * as React from "react";

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  isLoading?: boolean;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onChange, onClear, isLoading, ...props }, ref) => {
    const handleClear = () => {
      onChange("");
      onClear?.();
      // Focus the input after clearing
      if (typeof ref !== "function" && ref?.current) {
        ref.current.focus();
      }
    };

    return (
      <div className={cn("relative", className)}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9 pr-9"
          {...props}
        />
        {(value || isLoading) && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
                type="button"
                tabIndex={-1} 
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
