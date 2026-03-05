"use client";

/**
 * Calendar Sync Connections Page
 * Connect and manage external calendar integrations (Google, Outlook, Apple)
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
import { useAuthProtection } from "@/hooks/use-auth";
import { useCalendars, useSyncConnections } from "@/hooks/use-calendar";
import { useNotification } from "@/hooks/use-notification";
import {
  calendarApi,
  type CalendarProvider,
  type SyncDirection,
  type SyncFrequency,
} from "@/lib/api/calendar";
import { format } from "date-fns";
import {
  AlertCircle,
  Check,
  Cloud,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

const PROVIDERS: {
  id: CalendarProvider;
  name: string;
  icon: string;
  color: string;
}[] = [
  { id: "google", name: "Google Calendar", icon: "🔴", color: "#EA4335" },
  { id: "outlook", name: "Outlook Calendar", icon: "🔵", color: "#0078D4" },
  { id: "apple", name: "Apple Calendar", icon: "⚪", color: "#000000" },
];

export default function SyncConnectionsPage() {
  const t = useTranslations("calendar");
  useAuthProtection();

  const { calendars, isLoading: calendarsLoading } = useCalendars();
  const { connections, isLoading, triggerSync, disconnect } =
    useSyncConnections();
  const { addNotification } = useNotification();

  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] =
    useState<CalendarProvider | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleConnect = async (provider: CalendarProvider) => {
    setSelectedProvider(provider);
    setConnectDialogOpen(true);
  };

  const handleTriggerSync = async (connectionId: string) => {
    setSyncingId(connectionId);
    try {
      await triggerSync(connectionId);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (
      confirm(
        "Are you sure you want to disconnect this calendar? Events will no longer sync.",
      )
    ) {
      await disconnect(connectionId);
    }
  };

  const connectedProviders = new Set(connections.map((c) => c.provider));

  return (
    <PageLayout
      title={t("syncedCalendars")}
      description={t("syncedCalendarsDescription")}
      headerActions={
        <Button onClick={() => setConnectDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("connectCalendar")}
        </Button>
      }
    >
      {isLoading || calendarsLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connected Calendars */}
          {connections.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Connected Calendars
              </h3>
              {connections.map((connection) => {
                const provider = PROVIDERS.find(
                  (p) => p.id === connection.provider,
                );
                const isSyncing = syncingId === connection.connectionId;

                return (
                  <Card key={connection.connectionId}>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                          style={{
                            backgroundColor: `${provider?.color}20`,
                          }}
                        >
                          {provider?.icon}
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {provider?.name}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {connection.externalAccountId}
                          </CardDescription>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              handleTriggerSync(connection.connectionId)
                            }
                            disabled={isSyncing}
                          >
                            <RefreshCw
                              className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
                            />
                            Sync Now
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleDisconnect(connection.connectionId)
                            }
                            className="text-destructive"
                          >
                            <Unlink className="h-4 w-4 mr-2" />
                            Disconnect
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Status</span>
                          <div className="flex items-center gap-1 mt-1">
                            {connection.isActive ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-green-500" />
                                <span className="text-green-700 dark:text-green-400">
                                  Active
                                </span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                                <span className="text-yellow-700 dark:text-yellow-400">
                                  Inactive
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Sync Direction
                          </span>
                          <p className="mt-1 capitalize">
                            {connection.syncDirection.replace(/_/g, " ")}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Frequency
                          </span>
                          <p className="mt-1 capitalize">
                            {connection.syncFrequency.replace(/_/g, " ")}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Last Sync
                          </span>
                          <p className="mt-1">
                            {connection.lastSyncAt
                              ? format(
                                  new Date(connection.lastSyncAt),
                                  "MMM d, h:mm a",
                                )
                              : "Never"}
                          </p>
                        </div>
                      </div>

                      {connection.lastSyncStatus &&
                        connection.lastSyncStatus !== "success" && (
                          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Last sync: {connection.lastSyncStatus}
                          </div>
                        )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Available Providers */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              {connections.length > 0
                ? "Connect Another Calendar"
                : "Connect Your Calendar"}
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              {PROVIDERS.map((provider) => {
                const isConnected = connectedProviders.has(provider.id);

                return (
                  <Card
                    key={provider.id}
                    className={isConnected ? "opacity-60" : ""}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                          style={{
                            backgroundColor: `${provider.color}20`,
                          }}
                        >
                          {provider.icon}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{provider.name}</p>
                          {isConnected && (
                            <p className="text-xs text-muted-foreground">
                              Connected
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant={isConnected ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleConnect(provider.id)}
                        disabled={isConnected}
                      >
                        {isConnected ? "Connected" : "Connect"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                How Calendar Sync Works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                • <strong>Two-way sync:</strong> Events created in either
                calendar appear in both
              </p>
              <p>
                • <strong>Availability blocking:</strong> External events block
                booking slots
              </p>
              <p>
                • <strong>Privacy:</strong> Only busy/free status is shared, not
                event details
              </p>
              <p>
                • <strong>Real-time:</strong> Changes sync within minutes
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <ConnectCalendarDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        provider={selectedProvider}
        calendars={calendars}
      />
    </PageLayout>
  );
}

interface ConnectCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: CalendarProvider | null;
  calendars: Array<{ calendarId: string; name: string }>;
}

function ConnectCalendarDialog({
  open,
  onOpenChange,
  provider,
  calendars,
}: ConnectCalendarDialogProps) {
  const { addNotification } = useNotification();
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [syncDirection, setSyncDirection] = useState<SyncDirection>("two_way");
  const [syncFrequency, setSyncFrequency] =
    useState<SyncFrequency>("every_15_minutes");

  const providerInfo = PROVIDERS.find((p) => p.id === provider);

  const handleConnect = async () => {
    if (!provider || !selectedCalendarId) return;

    setIsConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/dashboard/calendar/sync/callback`;

      const { url } = await calendarApi.sync.initiateOAuth({
        provider,
        calendarId: selectedCalendarId,
        syncDirection,
        syncFrequency,
        redirectUri,
      });

      // Redirect to provider's OAuth consent screen
      window.location.href = url;
    } catch (err) {
      addNotification("Failed to initiate connection", "error");
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {providerInfo && (
              <span className="text-lg">{providerInfo.icon}</span>
            )}
            Connect {providerInfo?.name || "Calendar"}
          </DialogTitle>
          <DialogDescription>
            Sync your external calendar to keep availability up to date
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Local Calendar */}
          <div className="space-y-2">
            <Label>Connect to calendar</Label>
            <Select
              value={selectedCalendarId}
              onValueChange={setSelectedCalendarId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a calendar" />
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

          {/* Sync Direction */}
          <div className="space-y-2">
            <Label>Sync direction</Label>
            <Select
              value={syncDirection}
              onValueChange={(v) => setSyncDirection(v as SyncDirection)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="two_way">Two-way sync</SelectItem>
                <SelectItem value="one_way_from_external">
                  Import from {providerInfo?.name} only
                </SelectItem>
                <SelectItem value="one_way_to_external">
                  Export to {providerInfo?.name} only
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sync Frequency */}
          <div className="space-y-2">
            <Label>Sync frequency</Label>
            <Select
              value={syncFrequency}
              onValueChange={(v) => setSyncFrequency(v as SyncFrequency)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">Real-time (webhooks)</SelectItem>
                <SelectItem value="every_5_minutes">Every 5 minutes</SelectItem>
                <SelectItem value="every_15_minutes">
                  Every 15 minutes
                </SelectItem>
                <SelectItem value="every_hour">Every hour</SelectItem>
                <SelectItem value="manual">Manual only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConnecting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isConnecting || !selectedCalendarId}
          >
            {isConnecting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Connect with {providerInfo?.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
