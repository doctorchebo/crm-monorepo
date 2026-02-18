"use client";

/**
 * Booking Links Page
 * Create and manage booking links for scheduling meetings
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLayout } from "@/components/ui/page-layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthProtection } from "@/hooks/use-auth";
import { useBookingLinks, useCalendars } from "@/hooks/use-calendar";
import { useNotification } from "@/hooks/use-notification";
import type {
  BookingLink,
  BookingLinkStatus,
  CreateBookingLinkDto,
  RoundRobinMode,
} from "@/lib/api/calendar";
import {
  Clock,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

export default function BookingLinksPage() {
  const t = useTranslations("calendar");
  useAuthProtection();

  const { calendars, isLoading: calendarsLoading } = useCalendars();
  const {
    bookingLinks,
    isLoading,
    createBookingLink,
    updateBookingLink,
    deleteBookingLink,
  } = useBookingLinks();
  const { addNotification } = useNotification();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<BookingLink | null>(null);

  const handleCreateNew = () => {
    setEditingLink(null);
    setDialogOpen(true);
  };

  const handleEdit = (link: BookingLink) => {
    setEditingLink(link);
    setDialogOpen(true);
  };

  const handleCopyLink = (link: BookingLink) => {
    const url = link.publicUrl || `${window.location.origin}/book/${link.slug}`;
    navigator.clipboard.writeText(url);
    addNotification("Link copied to clipboard", "success");
  };

  const handleToggleStatus = async (link: BookingLink) => {
    const newStatus: BookingLinkStatus =
      link.status === "active" ? "paused" : "active";
    await updateBookingLink(link.bookingLinkId, { status: newStatus });
  };

  const handleDelete = async (link: BookingLink) => {
    if (confirm("Are you sure you want to delete this booking link?")) {
      await deleteBookingLink(link.bookingLinkId);
    }
  };

  return (
    <PageLayout
      title={t("bookingLinks")}
      description={t("bookingLinksDescription")}
      headerActions={
        <Button onClick={handleCreateNew} disabled={calendars.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          {t("newBookingLink")}
        </Button>
      }
    >
      {isLoading || calendarsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : bookingLinks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Link2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No booking links yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Create a booking link to let others schedule time with you
            </p>
            <Button onClick={handleCreateNew} disabled={calendars.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Create Booking Link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bookingLinks.map((link) => (
            <BookingLinkCard
              key={link.bookingLinkId}
              link={link}
              onEdit={() => handleEdit(link)}
              onCopy={() => handleCopyLink(link)}
              onToggleStatus={() => handleToggleStatus(link)}
              onDelete={() => handleDelete(link)}
            />
          ))}
        </div>
      )}

      <BookingLinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        link={editingLink}
        calendars={calendars}
        onSave={async (data) => {
          if (editingLink) {
            await updateBookingLink(editingLink.bookingLinkId, data);
          } else {
            await createBookingLink(data as CreateBookingLinkDto);
          }
          setDialogOpen(false);
        }}
      />
    </PageLayout>
  );
}

interface BookingLinkCardProps {
  link: BookingLink;
  onEdit: () => void;
  onCopy: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

function BookingLinkCard({
  link,
  onEdit,
  onCopy,
  onToggleStatus,
  onDelete,
}: BookingLinkCardProps) {
  const isPaused = link.status === "paused";
  const isArchived = link.status === "archived";

  return (
    <Card className={isPaused || isArchived ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">{link.name}</CardTitle>
          <CardDescription className="text-xs">/{link.slug}</CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Settings className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopy}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleStatus}>
              {isPaused ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Activate
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {link.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {link.description}
          </p>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{link.duration} minutes</span>
          </div>

          {link.isRoundRobin && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>Round-robin ({link.members?.length || 0} members)</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${
                link.status === "active"
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  : link.status === "paused"
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
              }`}
            >
              {link.status.charAt(0).toUpperCase() + link.status.slice(1)}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onCopy}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const url =
                link.publicUrl || `${window.location.origin}/book/${link.slug}`;
              window.open(url, "_blank");
            }}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface BookingLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: BookingLink | null;
  calendars: Array<{ calendarId: string; name: string }>;
  onSave: (data: Partial<CreateBookingLinkDto>) => Promise<void>;
}

function BookingLinkDialog({
  open,
  onOpenChange,
  link,
  calendars,
  onSave,
}: BookingLinkDialogProps) {
  const t = useTranslations("calendar");
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [duration, setDuration] = useState(30);
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(0);
  const [minNotice, setMinNotice] = useState(60);
  const [maxAdvance, setMaxAdvance] = useState(60);
  const [isRoundRobin, setIsRoundRobin] = useState(false);
  const [roundRobinMode, setRoundRobinMode] =
    useState<RoundRobinMode>("equal_distribution");
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Initialize form when dialog opens
  const initializeForm = useCallback(() => {
    if (link) {
      setName(link.name);
      setSlug(link.slug);
      setDescription(link.description || "");
      setCalendarId(String(link.calendarId));
      setDuration(link.duration);
      setBufferBefore(link.bufferBefore);
      setBufferAfter(link.bufferAfter);
      setMinNotice(link.minNotice);
      setMaxAdvance(link.maxAdvance);
      setIsRoundRobin(link.isRoundRobin);
      setRoundRobinMode(link.roundRobinMode || "equal_distribution");
      setRequiresApproval(link.requiresApproval);
    } else {
      setName("");
      setSlug("");
      setDescription("");
      setCalendarId(calendars[0]?.calendarId || "");
      setDuration(30);
      setBufferBefore(0);
      setBufferAfter(0);
      setMinNotice(60);
      setMaxAdvance(60);
      setIsRoundRobin(false);
      setRoundRobinMode("equal_distribution");
      setRequiresApproval(false);
    }
  }, [link, calendars]);

  // Reset form when dialog opens
  if (open) {
    // Using a ref pattern would be better, but for simplicity:
    // This will run on every render when open, but that's acceptable
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !calendarId) return;

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        calendarId,
        duration,
        bufferBefore,
        bufferAfter,
        minNotice,
        maxAdvance,
        isRoundRobin,
        roundRobinMode: isRoundRobin ? roundRobinMode : undefined,
        requiresApproval,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const generateSlug = () => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setSlug(slug);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (newOpen) initializeForm();
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {link ? "Edit Booking Link" : "Create Booking Link"}
            </DialogTitle>
            <DialogDescription>
              {link
                ? "Update your booking link settings"
                : "Create a new link for others to book time with you"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="30 Minute Meeting"
                required
                onBlur={() => !slug && generateSlug()}
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/book/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  placeholder="30-min-meeting"
                  required
                  disabled={!!link}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A quick 30-minute call to discuss your needs"
                rows={2}
              />
            </div>

            {/* Calendar */}
            <div className="space-y-2">
              <Label>Calendar</Label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((cal) => (
                    <SelectItem key={cal.calendarId} value={cal.calendarId}>
                      {cal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Select
                value={String(duration)}
                onValueChange={(v) => setDuration(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Buffers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Buffer before (min)</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={bufferBefore}
                  onChange={(e) =>
                    setBufferBefore(parseInt(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Buffer after (min)</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={bufferAfter}
                  onChange={(e) =>
                    setBufferAfter(parseInt(e.target.value) || 0)
                  }
                />
              </div>
            </div>

            {/* Scheduling limits */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min notice (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={minNotice}
                  onChange={(e) => setMinNotice(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max advance (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={maxAdvance}
                  onChange={(e) =>
                    setMaxAdvance(parseInt(e.target.value) || 60)
                  }
                />
              </div>
            </div>

            {/* Round Robin */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Round-robin scheduling</Label>
                <p className="text-xs text-muted-foreground">
                  Distribute bookings among team members
                </p>
              </div>
              <Switch
                checked={isRoundRobin}
                onCheckedChange={setIsRoundRobin}
              />
            </div>

            {isRoundRobin && (
              <div className="space-y-2 pl-4 border-l-2">
                <Label>Distribution mode</Label>
                <Select
                  value={roundRobinMode}
                  onValueChange={(v) => setRoundRobinMode(v as RoundRobinMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equal_distribution">
                      Equal distribution
                    </SelectItem>
                    <SelectItem value="availability_first">
                      Availability first
                    </SelectItem>
                    <SelectItem value="least_recently_booked">
                      Least recently booked
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Approval */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Requires approval</Label>
                <p className="text-xs text-muted-foreground">
                  Manually confirm each booking
                </p>
              </div>
              <Switch
                checked={requiresApproval}
                onCheckedChange={setRequiresApproval}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !name.trim() || !slug.trim()}
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {link ? "Save Changes" : "Create Link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
