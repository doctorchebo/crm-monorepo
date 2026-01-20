/**
 * Knowledge Base Dashboard Component
 *
 * Main dashboard showing statistics, recent activity, and quick actions
 * for the knowledge base system.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/ui/page-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  knowledgeBaseApi,
  type KnowledgeBaseStats,
} from "@/lib/api/knowledge-base";
import {
  Archive,
  BookOpen,
  Database,
  Edit,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR from "swr";

// ==================== Sub-components ====================

interface StatCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

function StatCard({ title, value, description, icon, trend }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <p
            className={`text-xs mt-1 flex items-center ${trend.isPositive ? "text-green-600" : "text-red-600"
              }`}
          >
            <TrendingUp
              className={`h-3 w-3 mr-1 ${!trend.isPositive && "rotate-180"}`}
            />
            {trend.isPositive ? "+" : ""}
            {trend.value}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

interface TemplateDistributionProps {
  data: KnowledgeBaseStats["objectsByTemplate"];
  title: string;
  description: string;
  emptyMessage: string;
}

function TemplateDistribution({
  data,
  title,
  description,
  emptyMessage,
}: TemplateDistributionProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-yellow-500",
    "bg-pink-500",
    "bg-indigo-500",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              {data.map((item, index) => {
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div
                    key={item.templateId}
                    className={`${colors[index % colors.length]
                      } transition-all`}
                    style={{ width: `${percentage}%` }}
                    title={`${item.templateName}: ${item.count}`}
                  />
                );
              })}
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-2">
              {data.map((item, index) => (
                <div key={item.templateId} className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full ${colors[index % colors.length]
                      }`}
                  />
                  <span className="text-sm truncate flex-1">
                    {item.templateName}
                  </span>
                  <span className="text-sm font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RecentActivityProps {
  activity: KnowledgeBaseStats["recentActivity"];
  title: string;
  description: string;
  emptyMessage: string;
  actionLabels: {
    created: string;
    updated: string;
    published: string;
    archived: string;
  };
  timeLabels: {
    justNow: string;
    minutesAgo: (count: number) => string;
    hoursAgo: (count: number) => string;
    daysAgo: (count: number) => string;
  };
}

function RecentActivity({
  activity,
  title,
  description,
  emptyMessage,
  actionLabels,
  timeLabels,
}: RecentActivityProps) {
  const router = useRouter();

  const getActionIcon = (action: string) => {
    switch (action) {
      case "created":
        return <Plus className="h-4 w-4 text-green-500" />;
      case "updated":
        return <Edit className="h-4 w-4 text-blue-500" />;
      case "published":
        return <BookOpen className="h-4 w-4 text-purple-500" />;
      case "archived":
        return <Archive className="h-4 w-4 text-gray-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionLabel = (action: string) => {
    return actionLabels[action as keyof typeof actionLabels] || action;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return timeLabels.justNow;
    if (diffMins < 60) return timeLabels.minutesAgo(diffMins);
    if (diffHours < 24) return timeLabels.hoursAgo(diffHours);
    if (diffDays < 7) return timeLabels.daysAgo(diffDays);
    return date.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-4">
            {activity.map((item, index) => (
              <div
                key={`${item.objectId}-${index}`}
                className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-md transition-colors"
                onClick={() =>
                  router.push(
                    `/dashboard/knowledge-base/objects/${item.objectId}`
                  )
                }
              >
                {getActionIcon(item.action)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.objectName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getActionLabel(item.action)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTime(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Main Component ====================

export function KnowledgeBaseDashboard() {
  const router = useRouter();
  const t = useTranslations("knowledgeBase.dashboard");
  const tCommon = useTranslations("knowledgeBase.common");

  const {
    data: stats,
    isLoading,
    mutate,
  } = useSWR<KnowledgeBaseStats>("knowledge-base-stats", () =>
    knowledgeBaseApi.getStats()
  );

  const handleRefresh = () => {
    mutate();
  };

  // Prepare time label functions for RecentActivity
  const timeLabels = {
    justNow: tCommon("justNow"),
    minutesAgo: (count: number) => tCommon("minutesAgo", { count }),
    hoursAgo: (count: number) => tCommon("hoursAgo", { count }),
    daysAgo: (count: number) => tCommon("daysAgo", { count }),
  };

  const actionLabels = {
    created: t("created"),
    updated: t("updated"),
    published: t("published"),
    archived: t("archived"),
  };

  return (
    <PageLayout
      title={t("title")}
      description={t("description")}
      headerActions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard/knowledge-base/test")}
          >
            <Search className="h-4 w-4 mr-2" />
            {t("testRetrieval")}
          </Button>
          <Button
            size="sm"
            onClick={() => router.push("/dashboard/knowledge-base/objects/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("newObject")}
          </Button>
        </div>
      }
      className="space-y-6"
    >

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : stats ? (
          <>
            <StatCard
              title={t("totalTemplates")}
              value={stats.totalTemplates}
              description={t("templatesDescription")}
              icon={<Layers className="h-4 w-4" />}
            />
            <StatCard
              title={t("totalObjects")}
              value={stats.totalObjects}
              description={t("publishedCount", {
                count: stats.objectsByStatus.published,
              })}
              icon={<FileText className="h-4 w-4" />}
            />
            <StatCard
              title={t("indexedChunks")}
              value={stats.totalChunks}
              description={t("chunksDescription")}
              icon={<Database className="h-4 w-4" />}
            />
            <StatCard
              title={t("draftObjects")}
              value={stats.objectsByStatus.draft}
              description={t("draftsDescription")}
              icon={<Edit className="h-4 w-4" />}
            />
          </>
        ) : null}
      </div>

      {/* Status Badges */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="default"
            className="bg-green-500/10 text-green-700 border-green-500/20"
          >
            <BookOpen className="h-3 w-3 mr-1" />
            {stats.objectsByStatus.published} {t("published")}
          </Badge>
          <Badge
            variant="default"
            className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
          >
            <Edit className="h-3 w-3 mr-1" />
            {stats.objectsByStatus.draft} {t("draft")}
          </Badge>
          <Badge
            variant="default"
            className="bg-gray-500/10 text-gray-700 border-gray-500/20"
          >
            <Archive className="h-3 w-3 mr-1" />
            {stats.objectsByStatus.archived} {t("archived")}
          </Badge>
        </div>
      )}

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          <>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-60" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-3 w-full rounded-full mb-4" />
                <div className="grid grid-cols-2 gap-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : stats ? (
          <>
            <TemplateDistribution
              data={stats.objectsByTemplate}
              title={t("objectsByTemplate")}
              description={t("objectsByTemplateDescription")}
              emptyMessage={t("noObjectsYet")}
            />
            <RecentActivity
              activity={stats.recentActivity}
              title={t("recentActivity")}
              description={t("recentActivityDescription")}
              emptyMessage={t("noRecentActivity")}
              actionLabels={actionLabels}
              timeLabels={timeLabels}
            />
          </>
        ) : null}
      </div>


    </PageLayout>
  );
}
