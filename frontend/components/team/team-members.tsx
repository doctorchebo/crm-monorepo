"use client";

import { EntityAuditHistoryPanel } from "@/components/audit";
import { DeleteConfirmationDialog } from "@/components/dialogs/delete-confirmation-dialog";
import { SmartAvatar } from "@/components/smart-avatar";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClientFilteredData } from "@/hooks/use-client-filtered-data";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import {
  History,
  Loader2,
  MoreVertical,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

interface TeamMembersProps {
  teamId: number;
}

interface TeamRole {
  id: number;
  name: string;
  description?: string;
}

function getUserDisplayName(member: any): string {
  return member.userName || member.userEmail || "Unknown User";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const memberSearchFn = (member: any, query: string): boolean => {
  const name = getUserDisplayName(member).toLowerCase();
  const role = (member.role || member.customRoleName || "").toLowerCase();
  return name.includes(query) || role.includes(query);
};

export function TeamMembers({ teamId }: TeamMembersProps) {
  const t = useTranslations("team");
  const tCommon = useTranslations("common");
  const { addNotification } = useNotification();
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<any | null>(null);
  const [historyMember, setHistoryMember] = useState<any | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);

  const {
    data: members,
    error,
    mutate: refreshMembers,
  } = useSWR<any[]>(
    ["team-members", teamId],
    () => backendApi.team.getMembers(teamId.toString()) as Promise<any[]>,
  );

  const { data: roles } = useSWR<TeamRole[]>(
    ["team-roles", teamId],
    () => backendApi.team.getRoles(teamId.toString()) as Promise<TeamRole[]>,
  );

  const availableRoles = roles?.filter((r) => r.name !== "Owner") || [];

  useEffect(() => {
    if (availableRoles.length > 0 && !inviteRole) {
      const defaultRole =
        availableRoles.find((r) => r.name === "Agent") || availableRoles[0];
      setInviteRole(defaultRole.name);
    }
  }, [availableRoles, inviteRole]);

  const getMemberId = useCallback((member: any) => String(member.id), []);

  const {
    searchQuery,
    setSearchQuery,
    isSearchPending,
    items: paginatedMembers,
    filteredTotal,
    page,
    pageSize,
    totalPages,
    pageSizeOptions,
    setPage,
    setPageSize,
    selectedIds,
    selectedCount,
    isAllSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useClientFilteredData({
    data: members,
    searchFn: memberSearchFn,
    getItemId: getMemberId,
    initialPageSize: 10,
  });

  const handleRemove = async () => {
    if (!memberToDelete) return;
    try {
      await backendApi.team.removeMember(
        teamId.toString(),
        memberToDelete.id.toString(),
      );
      addNotification(t("memberRemoved"), "success");
      refreshMembers();
    } catch {
      addNotification(t("memberRemoveFailed"), "error");
    }
    setMemberToDelete(null);
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      // Filter out owners from selection
      const deletableIds = Array.from(selectedIds).filter((id) => {
        const member = members?.find((m) => String(m.id) === id);
        return member && member.role?.toLowerCase() !== "owner";
      });

      const results = await Promise.allSettled(
        deletableIds.map((id) =>
          backendApi.team.removeMember(teamId.toString(), id),
        ),
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = deletableIds.length - succeeded;

      if (succeeded > 0) {
        addNotification(
          t("bulkRemoveSuccess", { count: succeeded }),
          "success",
        );
      }
      if (failed > 0) {
        addNotification(t("bulkRemoveFailed", { count: failed }), "error");
      }

      clearSelection();
      setBulkDeleteMode(false);
      refreshMembers();
    } catch {
      addNotification(t("bulkRemoveFailed", { count: selectedCount }), "error");
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteDialogOpen(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    try {
      await backendApi.team.inviteMember(teamId.toString(), {
        email: inviteEmail,
        role: inviteRole,
      });
      addNotification(t("invitationSent"), "success");
      setInviteOpen(false);
      setInviteEmail("");
    } catch {
      addNotification(t("invitationFailed"), "error");
    } finally {
      setIsInviting(false);
    }
  };

  if (error) return <div className="text-red-500">Failed to load members</div>;
  if (!members) return <Loader2 className="animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          isLoading={isSearchPending}
          placeholder={t("searchMembers")}
          className="w-full max-w-sm"
        />
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t("invite")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("inviteMember")}</DialogTitle>
              <DialogDescription>{t("enterEmail")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("email")}</Label>
                <Input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("role")}</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.name}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={isInviting || !inviteRole}
                className="w-full"
              >
                {isInviting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("invite")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bulk Action Bar */}
      {bulkDeleteMode && (
        <BulkActionBar
          selectedCount={selectedCount}
          onClearSelection={() => {
            clearSelection();
            setBulkDeleteMode(false);
          }}
          onDelete={() => setBulkDeleteDialogOpen(true)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("members")}</CardTitle>
        </CardHeader>
        <CardContent>
          {paginatedMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? t("noSearchResults") : t("noMembers")}
            </div>
          ) : (
            <ul className="space-y-4">
              {paginatedMembers.map((member) => {
                const isOwner = member.role?.toLowerCase() === "owner";
                return (
                  <li
                    key={member.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-4">
                      {bulkDeleteMode && !isOwner && (
                        <Checkbox
                          checked={selectedIds.has(String(member.id))}
                          onCheckedChange={() =>
                            toggleSelect(String(member.id))
                          }
                          aria-label={`Select ${getUserDisplayName(member)}`}
                        />
                      )}
                      <SmartAvatar
                        name={getUserDisplayName(member)}
                        email={member.userEmail}
                        profilePictureUrl={member.profilePictureUrl}
                        size="md"
                      />
                      <div>
                        <p className="font-medium">
                          {getUserDisplayName(member)}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {member.role || member.customRoleName || "Member"}
                        </p>
                      </div>
                    </div>
                    {!isOwner && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">{t("actions")}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setHistoryMember(member);
                            }}
                          >
                            <History className="mr-2 h-4 w-4" />
                            {t("viewHistory")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setBulkDeleteMode(true);
                              toggleSelect(String(member.id));
                            }}
                            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("remove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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

      {/* Single Delete Dialog */}
      <DeleteConfirmationDialog
        isOpen={!!memberToDelete}
        title={t("removeMemberTitle")}
        description={t("removeMemberDescription", {
          name: memberToDelete ? getUserDisplayName(memberToDelete) : "",
        })}
        onConfirm={handleRemove}
        onCancel={() => setMemberToDelete(null)}
      />

      {/* Bulk Delete Dialog */}
      <DeleteConfirmationDialog
        isOpen={bulkDeleteDialogOpen}
        title={t("bulkRemoveTitle")}
        description={t("bulkRemoveDescription", { count: selectedCount })}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteDialogOpen(false)}
        isLoading={isBulkDeleting}
      />

      {/* Entity Audit History */}
      {historyMember && (
        <EntityAuditHistoryPanel
          open={!!historyMember}
          onOpenChange={(open) => !open && setHistoryMember(null)}
          entityType="team_member"
          entityId={String(historyMember.id)}
          entityName={getUserDisplayName(historyMember)}
        />
      )}
    </div>
  );
}
