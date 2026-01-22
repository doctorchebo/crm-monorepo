"use client";

import { useTranslations } from "next-intl";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { backendApi } from "@/lib/api/endpoints";

interface TeamMetricsProps {
  teamId: number;
}

interface MetricItem {
  userId: number;
  userName: string;
  activeChats: number;
  closedChats: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function TeamMetrics({ teamId }: TeamMetricsProps) {
  const t = useTranslations("team");
  const tCommon = useTranslations("common");
  const { data: metrics, error, isLoading } = useSWR<MetricItem[]>(
    ['team-metrics', teamId],
    () => backendApi.team.getMetrics(teamId.toString()) as Promise<MetricItem[]>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-red-500">
        {tCommon("error")}: {error.message}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("analytics")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("member")}</TableHead>
              <TableHead className="text-right">{t("activeChats")}</TableHead>
              <TableHead className="text-right">{t("closedChats")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics && metrics.length > 0 ? (
              metrics.map((item) => (
                <TableRow key={item.userId}>
                  <TableCell className="font-medium">{item.userName}</TableCell>
                  <TableCell className="text-right text-green-600 font-bold">
                    {item.activeChats}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.closedChats}
                  </TableCell>
                </TableRow>
              ))
            ) : (
                <TableRow>
                    <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                        {t("noActivity")}
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
