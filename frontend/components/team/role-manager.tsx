"use client";

import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { 
  Users, 
  Plus, 
  Search, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  ShieldCheck, 
  Info,
  Check,
  X
} from "lucide-react";
import { useNotification } from "@/hooks/use-notification";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { createTeamRole, deleteTeamRole, updateTeamRole, getSystemPermissions, getTeamRoles } from "@/app/[locale]/(dashboard)/dashboard/team/actions";
import { groupPermissions } from "./role-utils";

// --- Types ---

export interface Role {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: { permission: { key: string; id: number } }[];
}

export interface Permission {
  id: number;
  key: string;
  category: string;
  description: string;
}

interface RoleManagerProps {
  teamId: number;
}

// --- Main Component ---

export function RoleManager({ teamId }: RoleManagerProps) {
  const t = useTranslations("team.roleManager");
  const { addNotification } = useNotification();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState<Role | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  // --- Data Fetching ---
  
  const { data: roles, error: rolesError, mutate: mutateRoles, isLoading: rolesLoading } = useSWR<Role[]>(
    ['team-roles', teamId], 
    () => getTeamRoles(teamId),
    {
       revalidateOnFocus: false
    }
  );

  const { data: allPermissions, isLoading: permsLoading } = useSWR<Permission[]>(
    ['system-permissions'],
    () => getSystemPermissions(),
    {
        revalidateOnFocus: false
    }
  );

  // --- Derived State ---

  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    if (!searchQuery) return roles;
    return roles.filter(role => 
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      role.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [roles, searchQuery]);

  // --- Handlers ---

  const handleCreateRole = async (data: { name: string; description: string; permissionIds: number[] }) => {
    const result = await createTeamRole(teamId, {
      name: data.name,
      description: data.description,
      ids_permissions: data.permissionIds
    });

    if (result.error) {
      addNotification(result.error, "error");
      return false;
    } else {
      addNotification(t("notifications.created"), "success");
      mutateRoles(); 
      return true;
    }
  };

  const handleUpdateRole = async (roleId: number, data: { name: string; description: string; permissionIds: number[] }) => {
    const result = await updateTeamRole(teamId, roleId, {
      name: data.name,
      description: data.description,
      ids_permissions: data.permissionIds
    });

    if (result.error) {
       addNotification(result.error, "error");
       return false;
    } else {
       addNotification(t("notifications.updated"), "success");
       mutateRoles();
       return true;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!roleToDelete) return;
    
    const result = await deleteTeamRole(teamId, roleToDelete.id);
    
    if (result.error) {
      addNotification(result.error, "error");
    } else {
      addNotification(t("notifications.deleted"), "success");
      mutateRoles();
    }
    setRoleToDelete(null);
  };

  if (rolesError) {
    return <div className="text-destructive">Failed to load roles.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-medium">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("createRole")}
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {rolesLoading || permsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {[1, 2, 3].map(i => <RoleCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRoles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={() => setRoleToEdit(role)}
              onDelete={() => setRoleToDelete(role)}
              t={t}
            />
          ))}
          {filteredRoles.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg">
                {t("noRoles")}
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <RoleEditorDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        title={t("createDialogTitle")}
        description={t("createDialogDesc")}
        allPermissions={allPermissions || []}
        onSubmit={handleCreateRole}
        t={t}
      />

      {/* Edit Dialog */}
      {roleToEdit && (
        <RoleEditorDialog
          open={!!roleToEdit}
          onOpenChange={(open) => !open && setRoleToEdit(null)}
          title={t("editDialogTitle", { name: roleToEdit.name })}
          description={t("editDialogDesc")}
          role={roleToEdit}
          allPermissions={allPermissions || []}
          onSubmit={(data) => handleUpdateRole(roleToEdit.id, data)}
          t={t}
        />
      )}

      {/* Delete Alert */}
      <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription dangerouslySetInnerHTML={{ 
                __html: t.raw("deleteDesc").replace("{name}", roleToDelete?.name || "") 
            }} />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// --- Subcomponents ---

function RoleCard({ role, onEdit, onDelete, t }: { role: Role; onEdit: () => void; onDelete: () => void; t: any }) {
  const isOwner = role.name === "Owner";
  const canDelete = !role.isSystem; 
  const canEdit = !isOwner; 
  
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
           {role.name}
           {role.isSystem && (
             <TooltipProvider>
               <Tooltip>
                 <TooltipTrigger>
                   <Badge variant="secondary" className="text-[10px] px-1 h-5">{t("systemRole")}</Badge>
                 </TooltipTrigger>
                 <TooltipContent>{t("systemRoleTooltip")}</TooltipContent>
               </Tooltip>
             </TooltipProvider>
           )}
        </CardTitle>
        {canEdit && (
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("edit")}
                </DropdownMenuItem>
                {canDelete && (
                    <>
                    <Separator className="my-1" />
                    <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("delete")}
                    </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
            </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="pb-2 flex-grow">
         <p className="text-sm text-muted-foreground line-clamp-2">
           {role.description || "No description provided."}
         </p>
         <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>
              {isOwner ? t("fullAccess") : t("permissionsCount", { count: role.permissions?.length || 0 })}
            </span>
         </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" onClick={onEdit}>
            {isOwner ? t("viewDetails") : t("managePermissions")}
        </Button>
      </CardFooter>
    </Card>
  );
}

function RoleCardSkeleton() {
    return (
        <Card className="h-[180px]">
            <CardHeader className="flex flex-row items-start justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-8 rounded-full" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
            </CardContent>
            <CardFooter>
                <Skeleton className="h-9 w-full" />
            </CardFooter>
        </Card>
    )
}

// --- Editor Dialog ---

interface RoleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  role?: Role;
  allPermissions: Permission[];
  onSubmit: (data: { name: string; description: string; permissionIds: number[] }) => Promise<boolean>;
  t: any;
}

function RoleEditorDialog({ open, onOpenChange, title, description, role, allPermissions, onSubmit, t }: RoleEditorDialogProps) {
  const [name, setName] = useState(role?.name || "");
  const [descriptionText, setDescriptionText] = useState(role?.description || "");
  // Extract initial permission IDs
  // Role has `permissions: { permission: { id } }[]` or something similar from DB
  const initialPerms = useMemo(() => {
    if (!role?.permissions) return new Set<number>();
    return new Set(role.permissions.map((p: any) => p.permissionId || p.permission?.id));
  }, [role]);

  const [selectedPermissions, setSelectedPermissions] = useState<Set<number>>(initialPerms);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const isOwner = role?.name === "Owner";

  // Grouped Permissions
  const groupedPerms = useMemo(() => {
    return groupPermissions(
        allPermissions.filter(p => 
            p.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.category.toLowerCase().includes(searchTerm.toLowerCase())
        )
    );
  }, [allPermissions, searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await onSubmit({
        name,
        description: descriptionText,
        permissionIds: Array.from(selectedPermissions)
    });
    setIsSubmitting(false);
    if (success) {
        onOpenChange(false);
    }
  };

  const togglePermission = (id: number) => {
    if (isOwner) return;
    const newSet = new Set(selectedPermissions);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setSelectedPermissions(newSet);
  };

  const toggleCategory = (category: string, perms: Permission[]) => {
      if (isOwner) return;
      const ids = perms.map(p => p.id);
      const allSelected = ids.every(id => selectedPermissions.has(id));
      
      const newSet = new Set(selectedPermissions);
      if (allSelected) {
          ids.forEach(id => newSet.delete(id));
      } else {
          ids.forEach(id => newSet.add(id));
      }
      setSelectedPermissions(newSet);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0">
        <div className="p-6 pb-4">
             <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="px-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="role-name">{t("roleName")}</Label>
                        <Input 
                            id="role-name" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            disabled={isOwner || (role?.isSystem && role?.name === "Admin")} 
                            placeholder={t("roleNamePlaceholder")}
                            required
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="role-desc">{t("description")}</Label>
                        <Input 
                            id="role-desc" 
                            value={descriptionText} 
                            onChange={(e) => setDescriptionText(e.target.value)} 
                            placeholder={t("descriptionPlaceholder")}
                            disabled={isOwner}
                        />
                    </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>{t("permissions")}</Label>
                        <div className="relative w-48">
                             <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                             <Input 
                                className="h-8 pl-7 text-xs" 
                                placeholder={t("filterPermissions")}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                             />
                        </div>
                    </div>
                </div>
            </div>

            <ScrollArea className="flex-1 px-6 py-4">
               {Object.entries(groupedPerms).length === 0 ? (
                   <div className="text-center py-8 text-muted-foreground text-sm">{t("noPermissions")}</div>
               ) : (
                   <div className="space-y-6">
                       {Object.entries(groupedPerms).map(([category, perms]) => {
                           const allCatSelected = perms.every(p => selectedPermissions.has(p.id));
                           
                           return (
                               <div key={category} className="space-y-3">
                                   <div className="flex items-center justify-between bg-muted/30 p-2 rounded-md">
                                       <div className="flex items-center gap-2">
                                            <Label className="font-semibold capitalize text-sm">{category}</Label>
                                            <Badge variant="outline" className="text-[10px] h-4">{perms.length}</Badge>
                                       </div>
                                       {!isOwner && (
                                            <Button 
                                                type="button" 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-6 text-xs"
                                                onClick={() => toggleCategory(category, perms)}
                                            >
                                                {allCatSelected ? t("deselectAll") : t("selectAll")}
                                            </Button>
                                       )}
                                   </div>
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2">
                                       {perms.map(perm => (
                                           <div 
                                                key={perm.id} 
                                                className={`
                                                    flex items-start gap-3 p-3 rounded-md border text-sm transition-colors
                                                    ${selectedPermissions.has(perm.id) ? "bg-primary/5 border-primary/20" : "bg-card hover:bg-muted/50"}
                                                    ${isOwner ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}
                                                `}
                                                onClick={() => togglePermission(perm.id)}
                                           >
                                                <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border
                                                    ${selectedPermissions.has(perm.id) 
                                                        ? "bg-primary text-primary-foreground border-primary" 
                                                        : "border-primary/50"}
                                                `}>
                                                    {selectedPermissions.has(perm.id) && <Check className="h-3 w-3" />}
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="font-medium leading-none">{perm.key}</p>
                                                    <p className="text-xs text-muted-foreground line-clamp-2">{perm.description}</p>
                                                </div>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               )}
            </ScrollArea>

            <div className="p-6 pt-4 border-t mt-auto bg-background">
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
                    {!isOwner && (
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? t("saving") : t("saveChanges")}
                        </Button>
                    )}
                </DialogFooter>
            </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
