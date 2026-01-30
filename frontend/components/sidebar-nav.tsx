"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  type NavItem,
  isNavItemActive,
  shouldExpandNavItem,
} from "@/lib/navigation";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface SidebarNavProps {
  items: NavItem[];
}

interface NavMenuItemProps {
  item: NavItem;
  pathname: string;
  t: ReturnType<typeof useTranslations>;
  level?: number;
}

/**
 * Recursive navigation menu item component
 * Supports infinite nesting of submenus
 */
function NavMenuItem({ item, pathname, t, level = 0 }: NavMenuItemProps) {
  const hasChildren = item.children && item.children.length > 0;
  const isActive = isNavItemActive(item, pathname);
  const shouldExpand = shouldExpandNavItem(item, pathname);
  const [isOpen, setIsOpen] = useState(shouldExpand);
  const { state, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Update open state when pathname changes
  useEffect(() => {
    if (shouldExpand) {
      setIsOpen(true);
    }
  }, [shouldExpand]);

  // Get label from translation using the labelKey
  const labelParts = item.labelKey.split(".");
  const label = t(labelParts[1] || labelParts[0]);

  // Handle click on menu item with children when sidebar is collapsed
  const handleCollapsibleChange = (open: boolean) => {
    if (isCollapsed && open) {
      // Expand sidebar first, then open the submenu
      setOpen(true);
      // Small delay to let sidebar expand before opening submenu
      setTimeout(() => setIsOpen(true), 150);
    } else {
      setIsOpen(open);
    }
  };

  // If item has children, render as collapsible
  if (hasChildren) {
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={handleCollapsibleChange}
        className="group/collapsible"
      >
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              tooltip={label}
              isActive={isActive}
              className="cursor-pointer w-full"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {!isCollapsed && (
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              )}
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children!.map((child) => (
                <NavSubMenuItem
                  key={child.id}
                  item={child}
                  pathname={pathname}
                  t={t}
                  level={level + 1}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  // Regular menu item without children
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="cursor-pointer"
        tooltip={label}
      >
        <Link href={item.href || "#"}>
          <item.icon className="h-4 w-4" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Submenu item component for nested navigation
 * Supports recursive nesting for multi-level menus
 */
function NavSubMenuItem({ item, pathname, t, level = 0 }: NavMenuItemProps) {
  const hasChildren = item.children && item.children.length > 0;
  const isActive = isNavItemActive(item, pathname);
  const shouldExpand = shouldExpandNavItem(item, pathname);
  const [isOpen, setIsOpen] = useState(shouldExpand);

  // Update open state when pathname changes
  useEffect(() => {
    if (shouldExpand) {
      setIsOpen(true);
    }
  }, [shouldExpand]);

  // Get label from translation using the labelKey
  const labelParts = item.labelKey.split(".");
  const label = t(labelParts[1] || labelParts[0]);

  // If item has children, render as nested collapsible
  if (hasChildren) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <SidebarMenuSubItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuSubButton
              className="cursor-pointer w-full"
              isActive={isActive}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </SidebarMenuSubButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children!.map((child) => (
                <NavSubMenuItem
                  key={child.id}
                  item={child}
                  pathname={pathname}
                  t={t}
                  level={level + 1}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuSubItem>
      </Collapsible>
    );
  }

  // Regular submenu item without children
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        isActive={isActive}
        className="cursor-pointer"
      >
        <Link href={item.href || "#"}>
          <item.icon className="h-4 w-4" />
          <span>{label}</span>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

/**
 * Main sidebar navigation component
 * Renders navigation items with support for multi-level submenus
 */
export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  return (
    <SidebarMenu>
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <NavMenuItem key={item.id} item={item} pathname={pathname} t={t} />
        ))}
    </SidebarMenu>
  );
}
