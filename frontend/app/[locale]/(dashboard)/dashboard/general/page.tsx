"use client";

import { updateAccount } from "@/app/[locale]/(login)/actions";
import { ProfilePictureUpload } from "@/components/profile-picture-upload";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLayout } from "@/components/ui/page-layout";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

type ActionState = {
  name?: string;
  error?: string;
  success?: string;
};

type AccountFormProps = {
  state: ActionState;
  nameValue?: string;
  emailValue?: string;
  t: ReturnType<typeof useTranslations>;
};

function AccountForm({
  state,
  nameValue = "",
  emailValue = "",
  t,
}: AccountFormProps) {
  return (
    <>
      <div>
        <Label htmlFor="name" className="mb-2">
          {t("name")}
        </Label>
        <Input
          id="name"
          name="name"
          placeholder={t("enterName")}
          defaultValue={state.name || nameValue}
          required
        />
      </div>
      <div>
        <Label htmlFor="email" className="mb-2">
          {t("email")}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={t("enterEmail")}
          defaultValue={emailValue}
          required
        />
      </div>
    </>
  );
}

function AccountFormWithData({
  state,
  t,
}: {
  state: ActionState;
  t: ReturnType<typeof useTranslations>;
}) {
  const { user, isLoading } = useUser();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || isLoading) {
    return <AccountForm state={state} t={t} />;
  }

  return (
    <AccountForm
      state={state}
      nameValue={user?.name ?? ""}
      emailValue={user?.email ?? ""}
      t={t}
    />
  );
}

function ProfilePictureSection() {
  const t = useTranslations("settings.profilePicture");
  const { user } = useUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfilePictureUpload userName={user?.name} userEmail={user?.email} />
      </CardContent>
    </Card>
  );
}

export default function GeneralPage() {
  const t = useTranslations("general");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateAccount,
    {},
  );

  return (
    <PageLayout title={t("title")}>
      <div className="space-y-6">
        {/* Profile Picture Section */}
        <ProfilePictureSection />

        {/* Account Information Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t("accountInfo")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action={formAction}>
              <AccountFormWithData state={state} t={t} />
              {state.error && (
                <p className="text-red-500 text-sm">{state.error}</p>
              )}
              {state.success && (
                <p className="text-green-500 text-sm">{state.success}</p>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("saving")}
                  </>
                ) : (
                  t("saveChanges")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
