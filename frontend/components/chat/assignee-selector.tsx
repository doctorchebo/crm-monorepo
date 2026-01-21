"use client";

import * as React from "react";
import { Check, ChevronsUpDown, User as UserIcon } from "lucide-react";
import useSWR from "swr";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  onAssign,
}: AssigneeSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();
  const { data: teamData } = useSWR<TeamDataWithMembers>("/api/team", fetcher);

  const selectedMember = teamData?.teamMembers?.find(
    (member) => member.userId === assigneeId
  );

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

  if (!teamData) {
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
                                {selectedMember.user.name?.charAt(0) || selectedMember.user.email.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">{selectedMember.user.name || selectedMember.user.email}</span>
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
              {teamData.teamMembers.map((member) => (
                <CommandItem
                  key={member.userId}
                  value={member.user.name || member.user.email}
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
                            {member.user.name?.charAt(0) || member.user.email.charAt(0)}
                        </AvatarFallback>
                     </Avatar>
                     <span className="truncate">{member.user.name || member.user.email}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
