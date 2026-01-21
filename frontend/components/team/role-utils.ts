import { Permission } from "./role-manager";

// Helper to filter permissions by search
export const filterPermissions = (
  permissions: Permission[],
  search: string,
) => {
  if (!search) return permissions;
  const lowerSearch = search.toLowerCase();
  return permissions.filter(
    (p) =>
      p.key.toLowerCase().includes(lowerSearch) ||
      p.description.toLowerCase().includes(lowerSearch) ||
      p.category.toLowerCase().includes(lowerSearch),
  );
};

// Group permissions by category
export const groupPermissions = (permissions: Permission[]) => {
  return permissions.reduce(
    (acc, perm) => {
      if (!acc[perm.category]) acc[perm.category] = [];
      acc[perm.category].push(perm);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );
};
