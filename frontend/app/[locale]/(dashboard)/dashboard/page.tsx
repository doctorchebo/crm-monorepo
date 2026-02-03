"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLayout } from "@/components/ui/page-layout";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuthProtection } from "@/hooks/use-auth";
import { useNotification } from "@/hooks/use-notification";
import { useTeam } from "@/hooks/use-team";
import { useUser } from "@/hooks/use-user";
import { User } from "@/lib/db/schema";
import { customerPortalAction } from "@/lib/payments/actions";
import { Loader2, PlusCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useActionState } from "react";
import { inviteTeamMember, removeTeamMember } from "../../(login)/actions";

type ActionState = {
  error?: string;
  success?: string;
};

// ============================================================================
// Loading Skeletons
// ============================================================================

function SubscriptionSkeleton() {
  const t = useTranslations("team");
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t("subscription")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="mb-4 sm:mb-0 space-y-2">
              <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMembersSkeleton() {
  const t = useTranslations("team");
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t("members")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4">
          <div className="flex items-center space-x-4">
            <div className="size-10 rounded-full bg-gray-200 dark:bg-gray-700"></div>
            <div className="space-y-2">
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteTeamMemberSkeleton() {
  const t = useTranslations("team");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invite")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="flex space-x-4">
              <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
          <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a display name for a user, falling back through name -> email -> "Unknown User"
 */
function getUserDisplayName(user: Pick<User, "id" | "name" | "email">): string {
  return user.name || user.email || "Unknown User";
}

/**
 * Get initials from a display name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ============================================================================
// Feature Components
// ============================================================================

function ManageSubscription() {
  const t = useTranslations("team");
  const { team, isLoading } = useTeam();

  if (isLoading) {
    return <SubscriptionSkeleton />;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t("subscription")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="mb-4 sm:mb-0">
              <p className="font-medium">
                {t("current")}: {team?.planName || "Free"}
              </p>
              <p className="text-sm text-muted-foreground">
                {team?.subscriptionStatus === "active"
                  ? t("billedMonthly")
                  : team?.subscriptionStatus === "trialing"
                    ? t("trial")
                    : t("noSubscription")}
              </p>
            </div>
            <form action={customerPortalAction}>
              <Button type="submit" variant="outline">
                {t("manageSubscription")}
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMembers() {
  const t = useTranslations("team");
  const { team, isLoading } = useTeam();
  const [removeState, removeAction, isRemovePending] = useActionState<
    ActionState,
    FormData
  >(removeTeamMember, {});

  if (isLoading) {
    return <TeamMembersSkeleton />;
  }

  if (!team?.teamMembers?.length) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{t("members")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("noMembers")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t("members")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {team.teamMembers.map((member, index) => (
            <li key={member.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Avatar>
                  <AvatarFallback>
                    {getInitials(getUserDisplayName(member.user))}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {getUserDisplayName(member.user)}
                  </p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {member.role}
                  </p>
                </div>
              </div>
              {index > 1 ? (
                <form action={removeAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={isRemovePending}
                  >
                    {isRemovePending ? t("removing") : t("remove")}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {removeState?.error && (
          <p className="text-red-500 mt-4">{removeState.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function InviteTeamMember() {
  const t = useTranslations("team");
  const { user, isLoading } = useUser();
  const { team } = useTeam();
  const currentUserMember = team?.teamMembers?.find(
    (member) => member.userId === user?.id,
  );
  const isOwner = currentUserMember?.role?.toLowerCase() === "owner";
  const [inviteState, inviteAction, isInvitePending] = useActionState<
    ActionState,
    FormData
  >(inviteTeamMember, {});
  const [lastProcessedState, setLastProcessedState] =
    React.useState<ActionState | null>(null);
  const { addNotification } = useNotification();

  // Show notifications when invitation state changes
  React.useEffect(() => {
    // Avoid showing notification for the same state twice
    if (!inviteState || inviteState === lastProcessedState) return;

    if (inviteState.success) {
      addNotification(t("invitationSent"), "success");
      setLastProcessedState(inviteState);
    } else if (inviteState.error) {
      addNotification(inviteState.error, "error");
      setLastProcessedState(inviteState);
    }
  }, [inviteState, lastProcessedState, addNotification, t]);

  if (isLoading) {
    return <InviteTeamMemberSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invite")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={inviteAction} className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-2">
              {t("email")}
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={t("enterEmail")}
              required
              disabled={!isOwner}
            />
          </div>
          <div>
            <Label>{t("role")}</Label>
            <RadioGroup
              defaultValue="member"
              name="role"
              className="flex space-x-4"
              disabled={!isOwner}
            >
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="member" id="member" />
                <Label htmlFor="member">{t("member")}</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="owner" id="owner" />
                <Label htmlFor="owner">{t("owner")}</Label>
              </div>
            </RadioGroup>
          </div>
          <Button type="submit" disabled={isInvitePending || !isOwner}>
            {isInvitePending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("inviting")}
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                {t("inviteMember")}
              </>
            )}
          </Button>
        </form>
      </CardContent>
      {!isOwner && (
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            {t("ownerOnlyInvite")}
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function SettingsPage() {
  const t = useTranslations("team");

  // Protect this route - redirect to login if token is missing or expired
  useAuthProtection();

  return (
    <PageLayout title={t("title")}>
      <ManageSubscription />
      <TeamMembers />
      <InviteTeamMember />
    </PageLayout>
  );
}
