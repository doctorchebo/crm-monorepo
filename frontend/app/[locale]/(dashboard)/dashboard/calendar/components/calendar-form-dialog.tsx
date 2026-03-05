"use client";

/**
 * Calendar Form Dialog
 * Used for creating and editing calendars
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  Calendar,
  CreateCalendarDto,
  UpdateCalendarDto,
} from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import { Globe, Loader2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildTimezoneOptions, getBrowserTimezone } from "./timezone-utils";

// Preset calendar colors (Google Calendar style)
const CALENDAR_COLORS = [
  { label: "Tomato", value: "#ef4444" },
  { label: "Flamingo", value: "#f97316" },
  { label: "Tangerine", value: "#f59e0b" },
  { label: "Banana", value: "#eab308" },
  { label: "Sage", value: "#84cc16" },
  { label: "Basil", value: "#22c55e" },
  { label: "Peacock", value: "#06b6d4" },
  { label: "Blueberry", value: "#3b82f6" },
  { label: "Lavender", value: "#a855f7" },
  { label: "Grape", value: "#ec4899" },
  { label: "Graphite", value: "#6b7280" },
];

interface CalendarFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendar?: Calendar | null;
  onSave: (data: CreateCalendarDto | UpdateCalendarDto) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function CalendarFormDialog({
  open,
  onOpenChange,
  calendar,
  onSave,
  onDelete,
}: CalendarFormDialogProps) {
  const isEditing = !!calendar;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(CALENDAR_COLORS[7].value);
  const [timezone, setTimezone] = useState("UTC");
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Timezone options — built once per mount (expensive to rebuild)
  const timezoneOptions = useMemo(() => buildTimezoneOptions(), []);

  // Reset form when dialog opens or calendar changes
  useEffect(() => {
    if (open) {
      if (calendar) {
        setName(calendar.name);
        setDescription(calendar.description ?? "");
        setColor(calendar.color ?? CALENDAR_COLORS[7].value);
        setTimezone(calendar.timezone ?? getBrowserTimezone());
        setIsDefault(calendar.isDefault);
      } else {
        setName("");
        setDescription("");
        setColor(CALENDAR_COLORS[7].value);
        // Auto-detect from browser; stored so it's submitted with the form
        setTimezone(getBrowserTimezone());
        setIsDefault(false);
      }
    }
  }, [open, calendar]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        timezone,
        isDefault,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
      setShowDeleteConfirm(false);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Calendar" : "Create Calendar"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the details for this calendar."
                : "Fill in the details below to create a new calendar."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="cal-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cal-name"
                placeholder="e.g. Work, Personal…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="cal-description">Description</Label>
              <Textarea
                id="cal-description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {CALENDAR_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all",
                      "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      color === c.value && "ring-2 ring-ring ring-offset-2",
                    )}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setColor(c.value)}
                  />
                ))}
              </div>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label htmlFor="cal-timezone">Timezone</Label>
              {isEditing ? (
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="cal-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {timezoneOptions.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {timezoneOptions.find((o) => o.value === timezone)?.label ||
                      timezone.replace(/_/g, " ")}
                  </span>
                </div>
              )}
              {!isEditing && (
                <p className="text-xs text-muted-foreground">
                  Auto-detected from your browser. You can change this later by
                  editing the calendar.
                </p>
              )}
            </div>

            {/* Default calendar */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="cal-default" className="cursor-pointer">
                  Default calendar
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  New events will be added here by default
                </p>
              </div>
              <Switch
                id="cal-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {isEditing && onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{calendar?.name}&quot; and all
              its events. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
