"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthProtection } from "@/hooks/use-auth";
import { PageLayout } from "@/components/ui/page-layout";
import { TeamMetrics } from "@/components/team/team-metrics";
import { TeamWorkload } from "@/components/team/team-workload";
import { TeamMembers } from "@/components/team/team-members";
import { ManageSubscription } from "@/components/team/manage-subscription";
import { RoleManager } from "@/components/team/role-manager";
import { backendApi } from "@/lib/api/endpoints";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamCenterPage() {
  const t = useTranslations("team");
  
  // Protect route
  useAuthProtection();

  // Fetch user's teams to get the current team ID
  // We use the centralized backendApi which handles auth cookies
  const { data: teams, error, isLoading } = useSWR<any[]>(
    ['user-teams'],
    () => backendApi.team.get() as Promise<any[]>
  );

  // For now, simpler implementation assuming single team per user or selecting first
  // In future, a global team context/selector would drive this
  const teamId = teams?.[0]?.id;

  if (isLoading) {
      return (
          <PageLayout title={t("title") || "Team Center"}>
              <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
          </PageLayout>
      );
  }

  // Handle error or no teams
  if (error || !teams || teams.length === 0) {
      return (
          <PageLayout title={t("title") || "Team Center"}>
              <Card>
                  <CardContent className="pt-6">
                      <div className="text-center text-muted-foreground">
                          {error ? "Failed to load team data." : "No team found. Please create or join a team."}
                      </div>
                  </CardContent>
              </Card>
          </PageLayout>
      );
  }

  return (
    <PageLayout title={t("title") || "Team Center"}>
      <Tabs defaultValue="workload" className="space-y-4">
        <TabsList>
            <TabsTrigger value="workload">{t("workload")}</TabsTrigger>
            <TabsTrigger value="members">{t("members")}</TabsTrigger>
            <TabsTrigger value="roles">{t("roles")}</TabsTrigger>
            <TabsTrigger value="metrics">{t("metrics")}</TabsTrigger>
            <TabsTrigger value="subscription">{t("subscription")}</TabsTrigger>
        </TabsList>

        <TabsContent value="workload" className="space-y-4">
          <TeamWorkload teamId={teamId} />
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <TeamMembers teamId={teamId} />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <RoleManager teamId={teamId} />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <TeamMetrics teamId={teamId} />
        </TabsContent>
        
        <TabsContent value="subscription" className="space-y-4">
          <ManageSubscription teamId={teamId} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
