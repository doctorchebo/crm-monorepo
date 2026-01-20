"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useNotification } from "@/hooks/use-notification";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Mail,
  Shield,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface InvitationPreview {
  teamName: string;
  inviterName?: string;
  role: string;
  email: string;
  expiresAt: string | null;
  status: string;
  userExists: boolean;
}

type PageState = "loading" | "preview" | "accepting" | "success" | "error";

export default function AcceptInvitationPage() {
  const t = useTranslations("invitation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addNotification } = useNotification();

  const token = searchParams.get("token");

  const [state, setState] = useState<PageState>("loading");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");

  // Fetch invitation preview on mount
  useEffect(() => {
    if (!token) {
      setError("No invitation token provided");
      setState("error");
      return;
    }

    const fetchPreview = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"}/invitations/preview?token=${encodeURIComponent(token)}`
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Failed to load invitation");
        }

        const data: InvitationPreview = await response.json();
        setPreview(data);
        setState("preview");
      } catch (err: any) {
        setError(err.message || "Failed to load invitation");
        setState("error");
      }
    };

    fetchPreview();
  }, [token]);

  const handleAccept = async () => {
    if (!token || !preview) return;

    // Validate password for new users
    if (!preview.userExists) {
      if (password.length < 8) {
        addNotification("Password must be at least 8 characters", "error");
        return;
      }
      if (password !== confirmPassword) {
        addNotification("Passwords do not match", "error");
        return;
      }
    }

    setState("accepting");

    try {
      const body: { token: string; password?: string; name?: string } = { token };

      if (!preview.userExists) {
        body.password = password;
        if (name.trim()) {
          body.name = name.trim();
        }
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"}/invitations/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to accept invitation");
      }

      setState("success");
      addNotification("You have joined the team!", "success");

      // Redirect to login or dashboard after a short delay
      setTimeout(() => {
        if (preview.userExists) {
          router.push("/dashboard");
        } else {
          router.push("/sign-in");
        }
      }, 2000);
    } catch (err: any) {
      addNotification(err.message || "Failed to accept invitation", "error");
      setState("preview");
    }
  };

  // Loading state
  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-lg">Loading invitation...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={() => router.push("/")}>Go to Home</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Success state
  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Welcome to {preview?.teamName}!</CardTitle>
            <CardDescription>
              {preview?.userExists
                ? "Redirecting to your dashboard..."
                : "Account created! Redirecting to sign in..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Preview state with acceptance form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You&apos;re Invited!</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join <strong>{preview?.teamName}</strong>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Invitation Details */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{preview?.email}</span>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm capitalize">
                Role: <strong>{preview?.role}</strong>
              </span>
            </div>
            {preview?.expiresAt && (
              <div className="text-xs text-muted-foreground">
                Expires: {new Date(preview.expiresAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* New user registration form */}
          {!preview?.userExists && (
            <div className="space-y-4 pt-2">
              <div className="text-sm text-muted-foreground text-center">
                Create your account to join the team
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            onClick={handleAccept}
            disabled={state === "accepting"}
            className="w-full"
          >
            {state === "accepting" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : preview?.userExists ? (
              "Accept Invitation"
            ) : (
              "Create Account & Join"
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            className="w-full"
          >
            Decline
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
