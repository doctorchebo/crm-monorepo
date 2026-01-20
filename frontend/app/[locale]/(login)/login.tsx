"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionState } from "@/lib/auth/middleware";
import { TokenManager } from "@/lib/auth/token-manager";
import { CircleIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect } from "react";
import { signIn, signUp } from "./actions";

export function Login({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const priceId = searchParams.get("priceId");
  const inviteId = searchParams.get("inviteId");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (previousState, formData) => {
      return await (mode === "signin" ? signIn : signUp)(
        previousState,
        formData
      );
    },
    { error: "" }
  );

  // Handle redirect after successful login
  useEffect(() => {
    if (
      state &&
      typeof state === "object" &&
      "expiresAt" in state &&
      !state.error
    ) {
      // Initialize TokenManager with expiration times
      // This will start auto-refresh checking and set tracking cookies
      const { expiresAt } = state as any;
      if (expiresAt?.access && expiresAt?.refresh) {
        TokenManager.storeTokenExpirationTime(
          new Date(expiresAt.access),
          new Date(expiresAt.refresh)
        );
        console.debug("[Login] TokenManager initialized with expiration times");
      }

      // JWT tokens are already set server-side as HTTP-only cookies
      // Redirect immediately to dashboard
      // Middleware will allow the request because tokens exist
      router.push("/dashboard");
    }
  }, [state, router]);

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <CircleIcon className="h-12 w-12 text-orange-500" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          {mode === "signin" ? t("signIn") : t("signUp")}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <form className="space-y-6" action={formAction}>
          <input type="hidden" name="redirect" value={redirect || ""} />
          <input type="hidden" name="priceId" value={priceId || ""} />
          <input type="hidden" name="inviteId" value={inviteId || ""} />
          <div>
            <Label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("email")}
            </Label>
            <div className="mt-1">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-orange-500 focus:border-orange-500 focus:z-10 sm:text-sm"
                placeholder={t("emailPlaceholder")}
              />
            </div>
          </div>

          <div>
            <Label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("password")}
            </Label>
            <div className="mt-1">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                defaultValue={state.password}
                required
                minLength={8}
                maxLength={100}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-orange-500 focus:border-orange-500 focus:z-10 sm:text-sm"
                placeholder={t("passwordPlaceholder")}
              />
            </div>
            {mode === "signin" && (
              <div className="mt-2 text-right">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
            )}
          </div>

          {state?.error && (
            <div className="text-red-500 dark:text-red-400 text-sm">
              {state.error}
            </div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 dark:focus:ring-offset-gray-950"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  {t("loading")}
                </>
              ) : mode === "signin" ? (
                t("signInButton")
              ) : (
                t("signUpButton")
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
                {mode === "signin"
                  ? t("newToOurPlatform")
                  : t("alreadyHaveAccount")}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href={`${mode === "signin" ? "/sign-up" : "/sign-in"}${
                redirect ? `?redirect=${redirect}` : ""
              }${priceId ? `&priceId=${priceId}` : ""}`}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-full shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 dark:focus:ring-offset-gray-950"
            >
              {mode === "signin" ? t("createAccount") : t("signInExisting")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
