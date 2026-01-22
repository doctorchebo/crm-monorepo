"use client";

import * as React from "react";
import { Check, ChevronsUpDown, User as UserIcon } from "lucide-react";
import useSWR from "swr";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { backendApi } from "@/lib/api/endpoints";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TeamDataWithMembers } from "@/lib/db/schema";
import { assignChat } from "@/app/[locale]/(dashboard)/dashboard/chats/actions";
import { useNotification } from "@/hooks/use-notification";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface AssigneeSelectorProps {
  chatId: string;
  assigneeId?: number | null;
  onAssign?: (newAssigneeId: number | null) => void;
}

export function AssigneeSelector({
  chatId,
  assigneeId,
  teamId,
  onAssign,
}: AssigneeSelectorProps & { teamId?: number | null }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();
  
  // Fetch members using backendApi if teamId is available
  const { data: members, isLoading } = useSWR<any[]>(
    teamId ? ['team-members', teamId] : null,
    () => backendApi.team.getMembers(teamId!.toString()) as Promise<any[]>
  );

  const selectedMember = members?.find(
    (member) => member.userId === assigneeId
  );
  
  const getUserDisplayName = (user: any) => user.name || user.email || "Unknown";
  const getUserInitials = (user: any) => (user.name || user.email || "?").charAt(0).toUpperCase();

  const handleSelect = async (memberId: number | null) => {
    setLoading(true);
    // Optimistic update
    onAssign?.(memberId);
    setOpen(false);

    try {
        const result = await assignChat(chatId, memberId);
        if (result.error) {
            addNotification(result.error, "error");
            // Revert? (Complex without extensive state management, assume failure rare)
        } else {
            addNotification(memberId ? "Chat assigned" : "Chat unassigned", "success");
        }
    } catch (e) {
        addNotification("Failed to assign chat", "error");
    } finally {
        setLoading(false);
    }
  };

  if (!teamId) {
      // Fallback or empty state if no teamId (legacy chats before fix)
      return null;
  }

  if (isLoading) {
      return <Button variant="ghost" size="sm" disabled>Loading...</Button>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between h-8"
          disabled={loading}
        >
            <div className="flex items-center gap-2 truncate">
                {selectedMember ? (
                    <>
                        <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                                {getUserInitials(selectedMember.user || selectedMember)}
                            </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">{getUserDisplayName(selectedMember.user || selectedMember)}</span>
                    </>
                ) : (
                    <>
                        <UserIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-muted-foreground text-sm">Unassigned</span>
                    </>
                )}
            </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search member..." />
          <CommandList>
            <CommandEmpty>No member found.</CommandEmpty>
            <CommandGroup>
                <CommandItem
                  value="unassigned"
                  onSelect={() => handleSelect(null)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !assigneeId ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Unassigned
                </CommandItem>
              {members?.map((member) => {
                 const user = member.user || member; // Handle different structure if any
                 return (
                    <CommandItem
                    key={member.userId}
                    value={getUserDisplayName(user)}
                    onSelect={() => handleSelect(member.userId)}
                    >
                    <Check
                        className={cn(
                        "mr-2 h-4 w-4",
                        assigneeId === member.userId ? "opacity-100" : "opacity-0"
                        )}
                    />
                    <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                                {getUserInitials(user)}
                            </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{getUserDisplayName(user)}</span>
                    </div>
                    </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
