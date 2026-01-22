"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityType } from "@/lib/db/schema";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Settings,
  UserCog,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { backendApi } from "@/lib/api/endpoints";
import useSWR from "swr";
import { useAuthProtection } from "@/hooks/use-auth";
import { PageLayout } from "@/components/ui/page-layout";

type ActivityLog = {
  id: number;
  action: string;
  timestamp: string;
  ipAddress?: string;
  userName?: string;
};

const iconMap: Record<string, LucideIcon> = {
  [ActivityType.SIGN_UP]: UserPlus,
  [ActivityType.SIGN_IN]: UserCog,
  [ActivityType.SIGN_OUT]: LogOut,
  [ActivityType.UPDATE_PASSWORD]: Lock,
  [ActivityType.DELETE_ACCOUNT]: UserMinus,
  [ActivityType.UPDATE_ACCOUNT]: Settings,
  [ActivityType.CREATE_TEAM]: UserPlus,
  [ActivityType.REMOVE_TEAM_MEMBER]: UserMinus,
  [ActivityType.INVITE_TEAM_MEMBER]: Mail,
  [ActivityType.ACCEPT_INVITATION]: CheckCircle,
};

function getRelativeTime(date: Date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

function formatAction(
  action: string,
  t: (key: string) => string
): string {
  switch (action) {
    case ActivityType.SIGN_UP:
      return t("signUp");
    case ActivityType.SIGN_IN:
      return t("signIn");
    case ActivityType.SIGN_OUT:
      return t("signOut");
    case ActivityType.UPDATE_PASSWORD:
      return t("updatePassword");
    case ActivityType.DELETE_ACCOUNT:
      return t("deleteAccount");
    case ActivityType.UPDATE_ACCOUNT:
      return t("updateAccount");
    case ActivityType.CREATE_TEAM:
      return t("createTeam");
    case ActivityType.REMOVE_TEAM_MEMBER:
      return t("removeTeamMember");
    case ActivityType.INVITE_TEAM_MEMBER:
      return t("inviteTeamMember");
    case ActivityType.ACCEPT_INVITATION:
      return t("acceptInvitation");
    default:
      return t("unknownAction");
  }
}

interface ActivityListProps {
  logs: ActivityLog[];
  t: (key: string) => string;
}

function ActivityList({ logs, t }: ActivityListProps) {
  return (
    <div>
      {logs.length > 0 ? (
        <ul className="space-y-4">
          {logs.map((log) => {
            const Icon = iconMap[log.action] || Settings;
            const formattedAction = formatAction(log.action, t);

            return (
              <li key={log.id} className="flex items-center space-x-4">
                <div className="bg-orange-100 rounded-full p-2">
                  <Icon className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formattedAction}
                    {log.ipAddress && ` from IP ${log.ipAddress}`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {getRelativeTime(new Date(log.timestamp))}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <AlertCircle className="h-12 w-12 text-orange-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("noActivity")}
          </h3>
          <p className="text-sm text-gray-500 max-w-sm">
            {t("noActivityDesc")}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const t = useTranslations("activity");
  
  // Protect route
  useAuthProtection();

  const { data: logs, error, isLoading } = useSWR<ActivityLog[]>(
    ['activity-logs'],
    () => backendApi.user.getActivity() as Promise<ActivityLog[]>
  );

  return (
    <PageLayout title={t("title")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="flex justify-center p-8">
               <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
                Failed to load activity logs
            </div>
          ) : (
            <ActivityList logs={logs || []} t={t} />
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
