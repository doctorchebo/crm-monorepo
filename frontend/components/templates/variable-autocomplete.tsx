"use client";

import { backendApi, VariableDefinition } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronRight,
  Home,
  MessageSquare,
  Settings,
  ShoppingCart,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  customer: <User className="h-4 w-4" />,
  chat: <MessageSquare className="h-4 w-4" />,
  sender: <Building2 className="h-4 w-4" />,
  order: <ShoppingCart className="h-4 w-4" />,
  property: <Home className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  customer: "Customer",
  chat: "Chat",
  sender: "Sender/Business",
  order: "Order",
  property: "Property",
  system: "System",
};

interface VariableAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  id?: string;
}

interface DropdownPosition {
  top: number;
  left: number;
}

export function VariableAutocomplete({
  value,
  onChange,
  placeholder,
  rows = 6,
  className,
  id,
}: VariableAutocompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    top: 0,
    left: 0,
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [triggerStart, setTriggerStart] = useState<number | null>(null);

  // Fetch variable definitions
  const { data: variableData } = useSWR(
    "variable-definitions",
    () => backendApi.templates.getVariableDefinitions(),
    { revalidateOnFocus: false }
  );

  const categories = variableData?.categories || [];
  const groupedDefinitions = variableData?.grouped || {};

  // Get filtered categories
  const getFilteredCategories = useCallback((): string[] => {
    return categories.filter((cat) =>
      cat.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [categories, searchQuery]);

  // Get filtered properties for selected category
  const getFilteredProperties = useCallback((): VariableDefinition[] => {
    if (!selectedCategory) return [];
    const defs = groupedDefinitions[selectedCategory] || [];
    return defs.filter(
      (def) =>
        def.property.toLowerCase().includes(searchQuery.toLowerCase()) ||
        def.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [selectedCategory, searchQuery, groupedDefinitions]);

  // Calculate dropdown position based on cursor
  const calculateDropdownPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);

    // Create a temporary div to measure text dimensions
    const mirror = document.createElement("div");
    mirror.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      font: ${getComputedStyle(textarea).font};
      width: ${textarea.clientWidth}px;
      padding: ${getComputedStyle(textarea).padding};
      border: ${getComputedStyle(textarea).border};
      line-height: ${getComputedStyle(textarea).lineHeight};
    `;
    mirror.textContent = textBeforeCursor;
    document.body.appendChild(mirror);

    const rect = textarea.getBoundingClientRect();
    const mirrorHeight = mirror.offsetHeight;
    document.body.removeChild(mirror);

    // Position dropdown below the current line
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
    const scrollTop = textarea.scrollTop;

    setDropdownPosition({
      top: Math.min(
        mirrorHeight - scrollTop + lineHeight,
        textarea.clientHeight
      ),
      left: 0,
    });
  }, [value]);

  // Handle text input
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPosition = e.target.selectionStart;
      onChange(newValue);

      // Check for trigger pattern {{
      const textBeforeCursor = newValue.substring(0, cursorPosition);
      const lastTriggerIndex = textBeforeCursor.lastIndexOf("{{");
      const lastCloseIndex = textBeforeCursor.lastIndexOf("}}");

      if (lastTriggerIndex > lastCloseIndex) {
        // We're inside a variable
        const textAfterTrigger = textBeforeCursor.substring(
          lastTriggerIndex + 2
        );

        // Check if there's a dot (category.property pattern)
        const dotIndex = textAfterTrigger.indexOf(".");

        if (dotIndex >= 0) {
          // User has typed category.
          const category = textAfterTrigger.substring(0, dotIndex);
          const propertySearch = textAfterTrigger.substring(dotIndex + 1);

          if (categories.includes(category)) {
            setSelectedCategory(category);
            setSearchQuery(propertySearch);
          } else {
            setSelectedCategory(null);
            setSearchQuery(textAfterTrigger);
          }
        } else {
          // User is still typing category
          setSelectedCategory(null);
          setSearchQuery(textAfterTrigger);
        }

        setTriggerStart(lastTriggerIndex);
        setShowDropdown(true);
        setHighlightedIndex(0);
        calculateDropdownPosition();
      } else {
        setShowDropdown(false);
        setTriggerStart(null);
        setSelectedCategory(null);
        setSearchQuery("");
      }
    },
    [onChange, categories, calculateDropdownPosition]
  );

  // Insert variable at cursor
  const insertVariable = useCallback(
    (category: string, property?: string) => {
      const textarea = textareaRef.current;
      if (!textarea || triggerStart === null) return;

      const variable = property ? `${category}.${property}` : category;
      const beforeTrigger = value.substring(0, triggerStart);
      const afterCursor = value.substring(textarea.selectionStart);

      // Check if we need to close the braces
      const needsClosing = !afterCursor.startsWith("}}");
      const insertion = property
        ? `{{${variable}}}${needsClosing ? "" : ""}`
        : `{{${variable}.`;

      const newValue =
        beforeTrigger +
        insertion +
        (property ? afterCursor.replace(/^\}\}/, "") : afterCursor);
      onChange(newValue);

      // Set cursor position
      setTimeout(() => {
        const newPosition = beforeTrigger.length + insertion.length;
        textarea.focus();
        textarea.setSelectionRange(newPosition, newPosition);

        if (!property) {
          // Category selected, show properties
          setSelectedCategory(category);
          setSearchQuery("");
          setHighlightedIndex(0);
          setTriggerStart(triggerStart);
          setShowDropdown(true);
        } else {
          // Full variable selected, close dropdown
          setShowDropdown(false);
          setTriggerStart(null);
          setSelectedCategory(null);
          setSearchQuery("");
        }
      }, 0);
    },
    [value, onChange, triggerStart]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown) return;

      const filteredCategories = getFilteredCategories();
      const filteredProperties = getFilteredProperties();
      const itemCount = selectedCategory
        ? filteredProperties.length
        : filteredCategories.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) => (prev + 1) % itemCount);
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => (prev - 1 + itemCount) % itemCount);
          break;
        case "Tab":
        case "Enter":
          e.preventDefault();
          if (itemCount > 0) {
            if (!selectedCategory) {
              // Select category
              insertVariable(filteredCategories[highlightedIndex]);
            } else {
              // Select property
              insertVariable(
                selectedCategory,
                filteredProperties[highlightedIndex].property
              );
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowDropdown(false);
          setSelectedCategory(null);
          setSearchQuery("");
          break;
        case "Backspace":
          // If we're at category selection and backspace, close dropdown
          if (selectedCategory && searchQuery === "") {
            setSelectedCategory(null);
          }
          break;
      }
    },
    [
      showDropdown,
      getFilteredCategories,
      getFilteredProperties,
      highlightedIndex,
      selectedCategory,
      insertVariable,
      searchQuery,
    ]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (showDropdown && dropdownRef.current) {
      const highlighted = dropdownRef.current.querySelector(
        "[data-highlighted=true]"
      );
      highlighted?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, showDropdown]);

  const filteredCategories = getFilteredCategories();
  const filteredProperties = getFilteredProperties();
  const hasItems = selectedCategory
    ? filteredProperties.length > 0
    : filteredCategories.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />

      {showDropdown && hasItems && (
        <div
          ref={dropdownRef}
          className="absolute z-50 min-w-[240px] max-h-[300px] overflow-auto rounded-md border bg-popover p-1 shadow-md"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
          }}
        >
          {/* Breadcrumb / Header */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b mb-1">
            {selectedCategory ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => {
                    setSelectedCategory(null);
                    setSearchQuery("");
                    setHighlightedIndex(0);
                  }}
                >
                  Variables
                </button>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground capitalize">
                  {selectedCategory}
                </span>
              </div>
            ) : (
              "Select a category"
            )}
          </div>

          {/* Items */}
          {!selectedCategory
            ? // Category list
              filteredCategories.map((category, index) => (
                <button
                  type="button"
                  key={category}
                  data-highlighted={index === highlightedIndex}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer",
                    index === highlightedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={() => insertVariable(category)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {CATEGORY_ICONS[category] || <Settings className="h-4 w-4" />}
                  <span className="capitalize">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                </button>
              ))
            : // Property list
              filteredProperties.map((def, index) => (
                <button
                  type="button"
                  key={def.id}
                  data-highlighted={index === highlightedIndex}
                  className={cn(
                    "flex flex-col items-start w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer",
                    index === highlightedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={() => insertVariable(selectedCategory, def.property)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <code className="text-xs bg-muted px-1 rounded">
                      {selectedCategory}.{def.property}
                    </code>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {def.displayName}
                    {def.description && ` - ${def.description}`}
                  </div>
                </button>
              ))}

          {!hasItems && (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              No matching variables found
            </div>
          )}

          {/* Help text */}
          <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
            <kbd className="px-1 bg-muted rounded">↑↓</kbd> navigate{" "}
            <kbd className="px-1 bg-muted rounded">Tab</kbd> select{" "}
            <kbd className="px-1 bg-muted rounded">Esc</kbd> close
          </div>
        </div>
      )}
    </div>
  );
}
