"use client";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useNotification } from "@/hooks/use-notification";
import {
  PASSWORD_REQUIREMENTS,
  getStrengthColor,
  getStrengthTextColor,
  validatePassword,
} from "@/lib/auth/password-validation";
import { backendApi } from "@/lib/api/endpoints";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageLayout } from "@/components/ui/page-layout";

export default function SecuritySettingsPage() {
  const t = useTranslations();
  const router = useRouter();
  const { addNotification } = useNotification();

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Delete account state
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Password validation
  const passwordValidation = validatePassword(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== "";

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!passwordValidation.isValid) {
      addNotification(t("security.passwordRequirements.title"), "error");
      return;
    }

    if (!passwordsMatch) {
      addNotification(t("security.passwordsDontMatch"), "error");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      await backendApi.auth.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      addNotification(t("security.passwordUpdated"), "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t("security.updateFailed");
      addNotification(errorMessage, "error");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      addNotification(t("security.passwordRequired"), "error");
      return;
    }

    setIsDeleting(true);

    try {
      await backendApi.auth.deleteAccount(deletePassword);

      // Redirect to sign-in page after successful deletion
      router.push("/sign-in");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t("security.deleteFailed");
      addNotification(errorMessage, "error");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <PageLayout
      title={t("security.title")}
      description={t("security.description")}
      className="space-y-6"
    >
      {/* Change Password Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("security.changePassword")}</CardTitle>
          <CardDescription>
            {t("security.changePasswordDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">
                {t("security.currentPassword")}
              </Label>
              <PasswordInput
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("security.enterCurrentPassword")}
                showLabel={t("security.showPassword")}
                hideLabel={t("security.hidePassword")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("security.newPassword")}</Label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("security.enterNewPassword")}
                showLabel={t("security.showPassword")}
                hideLabel={t("security.hidePassword")}
                required
              />

              {/* Password strength indicator */}
              {newPassword && (
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
                      const passed = req.test(newPassword);
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
              <Label htmlFor="confirmPassword">
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
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-500">
                  {t("security.passwordsDontMatch")}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={
                isUpdatingPassword ||
                !passwordValidation.isValid ||
                !passwordsMatch ||
                !currentPassword
              }
            >
              {isUpdatingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("security.updating")}
                </>
              ) : (
                t("security.updatePassword")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Delete Account Section */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">
            {t("security.deleteAccount")}
          </CardTitle>
          <CardDescription>{t("security.deleteDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={showDeleteDialog} onOpenChange={(open) => {
              setShowDeleteDialog(open);
              if (!open) {
                setDeletePassword("");
              }
            }}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <AlertTriangle className="mr-2 h-4 w-4" />
                {t("security.deleteAccount")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  {t("security.deleteAccountConfirmTitle")}
                </DialogTitle>
                <DialogDescription className="pt-2">
                  {t("security.deleteAccountConfirmDesc")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <ul className="list-disc list-inside space-y-1">
                    <li>{t("security.deleteWarningData")}</li>
                    <li>{t("security.deleteWarningChats")}</li>
                    <li>{t("security.deleteWarningIrreversible")}</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deletePassword">
                    {t("security.confirmWithPassword")}
                  </Label>
                  <PasswordInput
                    id="deletePassword"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={t("security.enterPassword")}
                    showLabel={t("security.showPassword")}
                    hideLabel={t("security.hidePassword")}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || !deletePassword}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("security.deleting")}
                    </>
                  ) : (
                    t("security.delete")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
