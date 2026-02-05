import {
  Activity,
  BookOpen,
  Bot,
  FileText,
  GitBranch,
  Home,
  Layers,
  LayoutGrid,
  MessageSquare,
  Package,
  Phone,
  Search,
  Send,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation item type supporting multi-level menus
 */
export interface NavItem {
  /** Unique identifier for the nav item */
  id: string;
  /** Translation key for the label */
  labelKey: string;
  /** Icon component to display */
  icon: LucideIcon;
  /** URL to navigate to (optional for parent items with children) */
  href?: string;
  /** Child navigation items (for submenu) */
  children?: NavItem[];
  /** Whether this item should be hidden */
  hidden?: boolean;
}

/**
 * Navigation configuration for the dashboard sidebar
 * This structure supports infinite nesting of submenus
 */
export const navigationConfig: NavItem[] = [
  {
    id: "home",
    labelKey: "dashboard.home",
    icon: Home,
    href: "/dashboard",
  },
  {
    id: "chats",
    labelKey: "dashboard.chats",
    icon: MessageSquare,
    href: "/dashboard/chats",
  },
  {
    id: "contacts",
    labelKey: "dashboard.contacts",
    icon: Users,
    href: "/dashboard/contacts",
  },
  {
    id: "templates",
    labelKey: "dashboard.templates",
    icon: FileText,
    href: "/dashboard/templates",
  },
  {
    id: "catalog",
    labelKey: "dashboard.catalog",
    icon: Package,
    href: "/dashboard/catalog",
  },
  {
    id: "senders",
    labelKey: "dashboard.senders",
    icon: Send,
    href: "/dashboard/senders",
  },
  {
    id: "kanban",
    labelKey: "dashboard.kanban",
    icon: LayoutGrid,
    href: "/dashboard/kanban",
  },
  {
    id: "workflows",
    labelKey: "dashboard.workflows",
    icon: GitBranch,
    href: "/dashboard/workflows",
  },
  {
    id: "knowledge-base",
    labelKey: "dashboard.knowledgeBase",
    icon: BookOpen,
    children: [
      {
        id: "kb-overview",
        labelKey: "dashboard.overview",
        icon: BookOpen,
        href: "/dashboard/knowledge-base",
      },
      {
        id: "kb-objects",
        labelKey: "dashboard.objects",
        icon: FileText,
        href: "/dashboard/knowledge-base/objects",
      },
      {
        id: "kb-templates",
        labelKey: "dashboard.templates",
        icon: Layers,
        href: "/dashboard/knowledge-base/templates",
      },
      {
        id: "kb-test",
        labelKey: "dashboard.testQueries",
        icon: Search,
        href: "/dashboard/knowledge-base/test",
      },
    ],
  },
  {
    id: "team",
    labelKey: "dashboard.team",
    icon: Users,
    href: "/dashboard/team",
  },
  {
    id: "settings",
    labelKey: "dashboard.settings",
    icon: Settings,
    children: [
      {
        id: "settings-general",
        labelKey: "dashboard.general",
        icon: Settings,
        href: "/dashboard/general",
      },
      {
        id: "settings-ai",
        labelKey: "dashboard.settingsAi",
        icon: Bot,
        href: "/dashboard/settings/ai",
      },
      {
        id: "settings-chats",
        labelKey: "dashboard.settingsChats",
        icon: MessageSquare,
        href: "/dashboard/settings/chats",
      },
      {
        id: "settings-workflow",
        labelKey: "dashboard.settingsWorkflow",
        icon: GitBranch,
        href: "/dashboard/settings/workflow",
      },
      {
        id: "settings-senders",
        labelKey: "dashboard.settingsSenders",
        icon: Phone,
        href: "/dashboard/settings/senders",
      },
      {
        id: "settings-security",
        labelKey: "dashboard.security",
        icon: Shield,
        href: "/dashboard/settings/security",
      },
    ],
  },
  {
    id: "activity",
    labelKey: "dashboard.activity",
    icon: Activity,
    href: "/dashboard/activity",
  },
];

/**
 * Helper function to check if a nav item or any of its children is active
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href && pathname === item.href) {
    return true;
  }
  if (item.children) {
    return item.children.some((child) => isNavItemActive(child, pathname));
  }
  return false;
}

/**
 * Helper function to check if a nav item should be expanded
 * (i.e., if any of its children matches the current path)
 */
export function shouldExpandNavItem(item: NavItem, pathname: string): boolean {
  if (!item.children) {
    return false;
  }
  return item.children.some((child) => isNavItemActive(child, pathname));
}

/**
 * Helper function to get flattened list of all href paths
 * Useful for prefetching or route validation
 */
export function getAllNavPaths(items: NavItem[] = navigationConfig): string[] {
  const paths: string[] = [];
  for (const item of items) {
    if (item.href) {
      paths.push(item.href);
    }
    if (item.children) {
      paths.push(...getAllNavPaths(item.children));
    }
  }
  return paths;
}
