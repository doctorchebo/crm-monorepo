"use client";

/**
 * Google Calendar OAuth Callback Page
 *
 * Google redirects here after the user grants calendar access.
 * We exchange the authorization code for tokens via the backend
 * and then redirect the user back to the sync connections page.
 */

import { useNotification } from "@/hooks/use-notification";
import { calendarApi, type CalendarProvider } from "@/lib/api/calendar";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = "loading" | "success" | "error";

export default function CalendarSyncCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addNotification } = useNotification();

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const hasRun = useRef(false);

  useEffect(() => {
    // Prevent double invocation in Strict Mode
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      const message =
        oauthError === "access_denied"
          ? "You denied access to your calendar."
          : `Authorization failed: ${oauthError}`;
      setErrorMessage(message);
      setStatus("error");
      return;
    }

    if (!code || !state) {
      setErrorMessage("Missing authorization code or state parameter.");
      setStatus("error");
      return;
    }

    // Decode state to retrieve the provider
    let provider: CalendarProvider;
    try {
      const decoded = JSON.parse(atob(state));
      provider = decoded.provider;
      if (!provider) throw new Error("Missing provider in state");
    } catch {
      setErrorMessage("Invalid state parameter – please try connecting again.");
      setStatus("error");
      return;
    }

    calendarApi.sync
      .completeOAuth({ code, state, provider })
      .then(() => {
        setStatus("success");
        addNotification("Calendar connected successfully!", "success");
        setTimeout(() => router.replace("/dashboard/calendar/sync"), 1500);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to connect calendar.";
        setErrorMessage(message);
        setStatus("error");
      });
  }, [searchParams, router, addNotification]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-sm px-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <h2 className="text-lg font-semibold">Connecting your calendar…</h2>
            <p className="text-sm text-muted-foreground">
              Completing authorization, please wait.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold">Calendar connected!</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting you back…
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Connection failed</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <button
              className="text-sm text-primary underline underline-offset-4"
              onClick={() => router.replace("/dashboard/calendar/sync")}
            >
              Go back to calendar settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}
