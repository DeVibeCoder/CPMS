import {
  LayoutDashboard,
  History,
  BarChart3,
  Settings,
  Boxes,
  CalendarClock,
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
  /** Short marker beside the label, e.g. a module still under development. */
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, section: "Overview" },
  { label: "Report History", to: "/reports", icon: History, section: "Reports" },
  // Inventory is a single page for now, so it is a plain link rather than an
  // expandable group. When a second inventory page is added, the intended shape
  // is a tab bar across the top of the section — not a sidebar dropdown.
  { label: "Inventory", to: "/inventory", icon: Boxes, section: "Inventory" },
  { label: "Analytics", to: "/analytics", icon: BarChart3, section: "Reports" },
  // Administrators and dispatch. Working hours are staff records, and dispatch
  // is who is at the plant when a shift starts — see the capability map in
  // `store/auth.ts`. Viewers do not see it at all.
  {
    label: "Attendance",
    to: "/attendance",
    icon: CalendarClock,
    section: "Staff",
    requires: "attendance",
  },
  // Users & Profile are grouped as tabs inside Settings. Everyone can open
  // Settings (viewers land on their Profile tab); admin-only tabs are gated
  // inside the settings hub.
  { label: "Settings", to: "/settings", icon: Settings, section: "Account" },
];
