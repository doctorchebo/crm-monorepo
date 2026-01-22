"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR, { mutate } from "swr";
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserMinus } from "lucide-react";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";

interface TeamWorkloadProps {
  teamId: number;
}

interface ChatAssignment {
  chatId: string;
  assignedTo: number | null;
  assignedToName?: string;
  participantPhone?: string;
  participantName?: string;
}

export function TeamWorkload({ teamId }: TeamWorkloadProps) {
  const t = useTranslations("team");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch ALL team chats (assigned + unassigned)
  const { data: allChats, error: chatsError, mutate: refreshChats } = useSWR<ChatAssignment[]>(
    ['team-all-chats', teamId],
    () => backendApi.chats.getAllForTeam(teamId.toString()) as Promise<ChatAssignment[]>
  );

  // Fetch team members for dropdown
  const { data: members, error: membersError } = useSWR<any[]>(
    ['team-members', teamId],
    () => backendApi.team.getMembers(teamId.toString()) as Promise<any[]>
  );

  const handleAssign = async (chatId: string, userId: string) => {
    try {
      setProcessingId(chatId);
      await backendApi.chats.assign(chatId, parseInt(userId));

      addNotification(t("assignSuccess"), "success");
      refreshChats();
      mutate(['team-metrics', teamId]);
    } catch (error) {
      addNotification(t("assignFailed"), "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnassign = async (chatId: string) => {
    try {
      setProcessingId(chatId);
      await backendApi.chats.unassign(chatId);

      addNotification(t("unassignSuccess"), "success");
      refreshChats();
      mutate(['team-metrics', teamId]);
    } catch (error) {
      addNotification(t("unassignFailed"), "error");
    } finally {
      setProcessingId(null);
    }
  };

  if (chatsError || membersError) {
    return <div className="text-red-500">{tCommon("error")}</div>;
  }

  const unassignedCount = allChats?.filter(c => !c.assignedTo).length ?? 0;
  const assignedCount = allChats?.filter(c => c.assignedTo).length ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("allChats")}</CardTitle>
          <CardDescription>
            {t("chatAssignment")} • {assignedCount} {t("assigned")}, {unassignedCount} {t("unassigned")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!allChats ? (
            <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
          ) : allChats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("noChats")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tCommon("participant")}</TableHead>
                  <TableHead>{t("assignedTo")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allChats.map((chat) => (
                  <TableRow key={chat.chatId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {chat.participantName || chat.participantPhone}
                        </span>
                        {chat.participantName && (
                          <span className="text-xs text-muted-foreground">
                            {chat.participantPhone}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {chat.assignedTo ? (
                        <span className="font-medium">{chat.assignedToName}</span>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          {t("unassigned")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          disabled={processingId === chat.chatId}
                          value={chat.assignedTo?.toString() ?? ""}
                          onValueChange={(val) => handleAssign(chat.chatId, val)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder={chat.assignedTo ? t("reassign") : t("assign")} />
                          </SelectTrigger>
                          <SelectContent>
                            {members?.map(m => (
                              <SelectItem key={m.userId} value={m.userId.toString()}>
                                {m.userName || m.userEmail}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {chat.assignedTo && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={processingId === chat.chatId}
                            onClick={() => handleUnassign(chat.chatId)}
                            title={t("unassign")}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                        {processingId === chat.chatId && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
