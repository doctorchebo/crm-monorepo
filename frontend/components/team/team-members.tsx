"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { backendApi } from "@/lib/api/endpoints";
import useSWR from "swr";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNotification } from "@/hooks/use-notification";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TeamMembersProps {
  teamId: number;
}

interface TeamRole {
  id: number;
  name: string;
  description?: string;
}

export function TeamMembers({ teamId }: TeamMembersProps) {
  const t = useTranslations("team");
  const { addNotification } = useNotification();
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  
  const { data: members, error, mutate: refreshMembers } = useSWR<any[]>(
    ['team-members', teamId],
    () => backendApi.team.getMembers(teamId.toString()) as Promise<any[]>
  );

  // Fetch available roles for the team
  const { data: roles } = useSWR<TeamRole[]>(
    ['team-roles', teamId],
    () => backendApi.team.getRoles(teamId.toString()) as Promise<TeamRole[]>
  );

  // Filter out Owner role and set default when roles are loaded
  const availableRoles = roles?.filter(r => r.name !== 'Owner') || [];
  
  useEffect(() => {
    if (availableRoles.length > 0 && !inviteRole) {
      // Default to Agent role, or first available role
      const defaultRole = availableRoles.find(r => r.name === 'Agent') || availableRoles[0];
      setInviteRole(defaultRole.name);
    }
  }, [availableRoles, inviteRole]);

  const handleRemove = async (memberId: number) => {
    if (!confirm(t("deleteTitle"))) return;
    try {
        await backendApi.team.removeMember(teamId.toString(), memberId.toString());
        addNotification(t("notifications.deleted"), "success");
        refreshMembers();
    } catch (error) {
        addNotification("Failed to remove member", "error");
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsInviting(true);
      try {
          await backendApi.team.inviteMember(teamId.toString(), { email: inviteEmail, role: inviteRole });
          addNotification(t("invitationSent"), "success");
          setInviteOpen(false);
          setInviteEmail("");
      } catch (error) {
          addNotification(t("invitationFailed"), "error");
      } finally {
          setIsInviting(false);
      }
  };

  const getUserDisplayName = (user: any) => {
    return user.userName || user.userEmail || "Unknown User";
  };

  if (error) return <div className="text-red-500">Failed to load members</div>;
  if (!members) return <Loader2 className="animate-spin" />;

  return (
    <div className="space-y-6">
        <div className="flex justify-end">
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
                                onChange={e => setInviteEmail(e.target.value)}
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
                        <Button type="submit" disabled={isInviting || !inviteRole} className="w-full">
                            {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t("invite")}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("members")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Avatar>
                    <AvatarFallback>
                      {getUserDisplayName(member)
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {getUserDisplayName(member)}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {member.role || member.customRoleName || "Member"}
                    </p>
                  </div>
                </div>
                {/* Prevent deleting yourself or maybe check permissions? */}
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={member.role?.toLowerCase() === 'owner'}
                    onClick={() => handleRemove(member.id)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                   <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

