"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClientFilteredData } from "@/hooks/use-client-filtered-data";
import { backendApi } from "@/lib/api/endpoints";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import useSWR from "swr";

interface TeamMetricsProps {
  teamId: number;
}

interface MetricItem {
  userId: number;
  userName: string;
  activeChats: number;
  closedChats: number;
}

const metricSearchFn = (item: MetricItem, query: string): boolean => {
  return item.userName.toLowerCase().includes(query);
};

export function TeamMetrics({ teamId }: TeamMetricsProps) {
  const t = useTranslations("team");
  const tCommon = useTranslations("common");
  const {
    data: metrics,
    error,
    isLoading,
  } = useSWR<MetricItem[]>(
    ["team-metrics", teamId],
    () =>
      backendApi.team.getMetrics(teamId.toString()) as Promise<MetricItem[]>,
  );

  const {
    searchQuery,
    setSearchQuery,
    isSearchPending,
    items: paginatedMetrics,
    filteredTotal,
    page,
    pageSize,
    totalPages,
    pageSizeOptions,
    setPage,
    setPageSize,
  } = useClientFilteredData({
    data: metrics,
    searchFn: metricSearchFn,
    initialPageSize: 10,
  });

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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          isLoading={isSearchPending}
          placeholder={t("searchMembers")}
          className="w-full max-w-sm"
        />
      </div>

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
              {paginatedMetrics.length > 0 ? (
                paginatedMetrics.map((item) => (
                  <TableRow key={item.userId}>
                    <TableCell className="font-medium">
                      {item.userName}
                    </TableCell>
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
                  <TableCell
                    colSpan={3}
                    className="text-center h-24 text-muted-foreground"
                  >
                    {searchQuery ? t("noSearchResults") : t("noActivity")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={pageSizeOptions}
      />
    </div>
  );
}
