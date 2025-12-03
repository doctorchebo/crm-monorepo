import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivityLogs } from "@/lib/db/queries";
import { ActivityType } from "@/lib/db/schema";
import {
  AlertCircle,
  CheckCircle,
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

const iconMap: Record<ActivityType, LucideIcon> = {
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
  action: ActivityType,
  t: ReturnType<typeof useTranslations>
): string {
  switch (action) {
    case ActivityType.SIGN_UP:
      return t("activity.signUp");
    case ActivityType.SIGN_IN:
      return t("activity.signIn");
    case ActivityType.SIGN_OUT:
      return t("activity.signOut");
    case ActivityType.UPDATE_PASSWORD:
      return t("activity.updatePassword");
    case ActivityType.DELETE_ACCOUNT:
      return t("activity.deleteAccount");
    case ActivityType.UPDATE_ACCOUNT:
      return t("activity.updateAccount");
    case ActivityType.CREATE_TEAM:
      return t("activity.createTeam");
    case ActivityType.REMOVE_TEAM_MEMBER:
      return t("activity.removeTeamMember");
    case ActivityType.INVITE_TEAM_MEMBER:
      return t("activity.inviteTeamMember");
    case ActivityType.ACCEPT_INVITATION:
      return t("activity.acceptInvitation");
    default:
      return t("activity.unknownAction");
  }
}

export default async function ActivityPage() {
  const t = useTranslations();
  const logs = await getActivityLogs();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">
        {t("activity.title")}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("activity.recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <ul className="space-y-4">
              {logs.map((log) => {
                const Icon = iconMap[log.action as ActivityType] || Settings;
                const formattedAction = formatAction(
                  log.action as ActivityType,
                  t
                );

                return (
                  <li key={log.id} className="flex items-center space-x-4">
                    <div className="bg-orange-100 rounded-full p-2">
                      <Icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formattedAction}
                        {log.ipAddress && ` from IP ${log.ipAddress}`}
                      </p>
                      <p className="text-xs text-gray-500">
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
                {t("activity.noActivity")}
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                {t("activity.noActivityDesc")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
