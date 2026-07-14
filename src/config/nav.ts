import {
  LayoutDashboard,
  History,
  BarChart3,
  Users,
  Settings,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import type { Capability } from "@/store/auth";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Capability required to see this item (undefined = everyone). */
  requires?: Capability;
  section?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, section: "Overview" },
  { label: "Report History", to: "/reports", icon: History, section: "Reports" },
  { label: "Analytics", to: "/analytics", icon: BarChart3, section: "Reports" },
  {
    label: "Users",
    to: "/users",
    icon: Users,
    requires: "manageUsers",
    section: "Administration",
  },
  {
    label: "Settings",
    to: "/settings",
    icon: Settings,
    requires: "settings",
    section: "Administration",
  },
  { label: "Profile", to: "/profile", icon: UserCircle, section: "Account" },
];
