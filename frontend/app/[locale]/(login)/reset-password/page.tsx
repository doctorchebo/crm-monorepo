"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  PASSWORD_REQUIREMENTS,
  getStrengthColor,
  getStrengthTextColor,
  validatePassword,
} from "@/lib/auth/password-validation";
import { backendApi } from "@/lib/api/endpoints";
import { CircleIcon, Loader2, Check, X, CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function ResetPasswordForm() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [tokenError, setTokenError] = useState(false);

  const passwordValidation = validatePassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";

  useEffect(() => {
    if (!token) {
      setTokenError(true);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!passwordValidation.isValid) {
      setError(t("security.passwordRequirements.title"));
      return;
    }

    if (!passwordsMatch) {
      setError(t("security.passwordsDontMatch"));
      return;
    }

    setIsSubmitting(true);

    try {
      await backendApi.auth.resetPassword({
        token: token!,
        password,
        confirmPassword,
      });

      setIsSuccess(true);
      // Redirect to sign-in after 3 seconds
      setTimeout(() => {
        router.push("/sign-in");
      }, 3000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "";
      if (errorMessage.includes("invalid") || errorMessage.includes("expired")) {
        setTokenError(true);
      } else {
        setError(errorMessage || t("auth.resetFailed"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (tokenError) {
    return (
      <div className="bg-white dark:bg-gray-900 py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
            <X className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            {t("auth.invalidResetToken")}
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t("auth.invalidResetTokenDescription")}
          </p>
          <div className="mt-6">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300"
            >
              {t("auth.requestNewLink")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="bg-white dark:bg-gray-900 py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            {t("auth.passwordReset")}
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t("auth.passwordResetDescription")}
          </p>
          <div className="mt-6">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-orange-600 hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300"
            >
              {t("auth.signInButton")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-gray-900 py-8 px-4 shadow sm:rounded-lg sm:px-10 space-y-6"
    >
      <div className="space-y-2">
        <Label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t("security.newPassword")}
        </Label>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("security.enterNewPassword")}
          showLabel={t("security.showPassword")}
          hideLabel={t("security.hidePassword")}
          required
          className="rounded-full"
        />

        {/* Password strength indicator */}
        {password && (
          <div className="space-y-2 mt-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${getStrengthColor(
                    passwordValidation.strength
                  )}`}
                  style={{
                    width: `${(passwordValidation.score / 5) * 100}%`,
                  }}
                />
              </div>
              <span
                className={`text-xs font-medium ${getStrengthTextColor(
                  passwordValidation.strength
                )}`}
              >
                {t(`security.strength.${passwordValidation.strength}`)}
              </span>
            </div>

            {/* Requirements checklist */}
            <div className="text-xs space-y-1">
              <p className="font-medium text-muted-foreground">
                {t("security.passwordRequirements.title")}
              </p>
              {PASSWORD_REQUIREMENTS.map((req) => {
                const passed = req.test(password);
                return (
                  <div
                    key={req.key}
                    className={`flex items-center gap-1.5 ${
                      passed
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {passed ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    <span>
                      {t(`security.passwordRequirements.${req.key}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t("security.confirmPassword")}
        </Label>
        <PasswordInput
          id="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t("security.confirmNewPassword")}
          showLabel={t("security.showPassword")}
          hideLabel={t("security.hidePassword")}
          required
          className="rounded-full"
        />
        {confirmPassword && !passwordsMatch && (
          <p className="text-xs text-red-500">
            {t("security.passwordsDontMatch")}
          </p>
        )}
      </div>

      {error && (
        <div className="text-red-500 dark:text-red-400 text-sm">{error}</div>
      )}

      <div>
        <Button
          type="submit"
          className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 dark:focus:ring-offset-gray-950"
          disabled={
            isSubmitting || !passwordValidation.isValid || !passwordsMatch
          }
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin mr-2 h-4 w-4" />
              {t("auth.loading")}
            </>
          ) : (
            t("auth.resetPassword")
          )}
        </Button>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth");

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <CircleIcon className="h-12 w-12 text-orange-500" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          {t("enterNewPassword")}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          {t("enterNewPasswordDescription")}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Suspense
          fallback={
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
