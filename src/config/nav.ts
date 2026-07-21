import {
  LayoutDashboard,
  History,
  BarChart3,
  Settings,
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
  // Users & Profile are grouped as tabs inside Settings. Everyone can open
  // Settings (viewers land on their Profile tab); admin-only tabs are gated
  // inside the settings hub.
  { label: "Settings", to: "/settings", icon: Settings, section: "Account" },
];
