"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { backendApi } from "@/lib/api/endpoints";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import useSWR from "swr";

interface ManageSubscriptionProps {
  teamId: number;
}

export function ManageSubscription({ teamId }: ManageSubscriptionProps) {
  const t = useTranslations("team");

  // In a real app, you might fetch specific subscription details
  // Here we reuse the team data fetch which typically includes plan info
  const {
    data: teamData,
    error,
    isLoading,
  } = useSWR<any>(["team-subscription", teamId], () =>
    backendApi.team
      .get()
      .then((teams) => (teams as any[]).find((t: any) => t.id === teamId)),
  );

  const handlePortal = async () => {
    try {
      // This would redirect to Stripe portal via backend endpoint
      // await backendApi.billing.createPortalSession(...)
      window.location.href = "/api/billing/portal"; // Use legacy route for now if needed or backendApi
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;
  if (error || !teamData)
    return <div className="text-red-500">Failed to load subscription</div>;

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
                {t("current")}: {teamData?.planName || "Free"}
              </p>
              <p className="text-sm text-muted-foreground">
                {teamData?.subscriptionStatus === "active"
                  ? t("billedMonthly")
                  : teamData?.subscriptionStatus === "trialing"
                    ? t("trial")
                    : t("noSubscription")}
              </p>
            </div>
            {/* 
                For now we keep the button but disable action until billing endpoint is securely reachable 
                or just redirect to billing settings 
            */}
            <Button variant="outline" onClick={handlePortal}>
              {t("manageSubscription")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
