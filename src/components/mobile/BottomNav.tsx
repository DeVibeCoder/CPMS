import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  CalendarClock,
  History,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { can, useAuth, type Capability } from "@/store/auth";

interface Tab {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Active when the path starts with this (for nested routes). */
  match: (path: string) => boolean;
  /** Capability required to see this tab (undefined = everyone). */
  requires?: Capability;
}

const TABS: Tab[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    match: (p) => p.startsWith("/dashboard"),
  },
  {
    label: "Reports",
    to: "/reports",
    icon: History,
    match: (p) => p.startsWith("/reports"),
  },
  {
    label: "Stock",
    to: "/inventory",
    icon: Boxes,
    match: (p) => p.startsWith("/inventory"),
  },
  {
    label: "Analytics",
    to: "/analytics",
    icon: BarChart3,
    match: (p) => p.startsWith("/analytics"),
  },
  // Attendance is administrator-only. There is no sidebar on mobile, so without
  // a tab it would be unreachable on a phone — and it is filtered out for
  // everyone else, whose bar is unchanged.
  {
    label: "Attendance",
    to: "/attendance",
    icon: CalendarClock,
    match: (p) => p.startsWith("/attendance"),
    requires: "attendance",
  },
  // Settings is a hub — Users & Profile are tabs inside it. It replaces the old
  // "Menu" sheet; theme and sign-out moved to the header's account controls.
  {
    label: "Settings",
    to: "/settings",
    icon: Settings,
    match: (p) =>
      p.startsWith("/settings") ||
      p.startsWith("/users") ||
      p.startsWith("/profile"),
  },
];

export function BottomNav() {
  const location = useLocation();
  const role = useAuth((s) => s.user?.role);
  const tabs = TABS.filter((t) => !t.requires || can(role, t.requires));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg pb-safe">
      {/* Six tabs have to share the narrowest screen the app runs on. At 360px
          that is about 54px each, so the highlight pill is sized to fit inside
          that rather than to a round number — a pill wider than its share is
          what pushes the last tab off the end. */}
      <div className="mx-auto flex max-w-lg items-stretch gap-0.5 px-1.5 py-0.5">
        {tabs.map((tab) => {
          const active = tab.match(location.pathname);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-medium leading-none transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  active && "bg-primary/[12%]",
                )}
              >
                <tab.icon className="h-5 w-5" />
              </span>
              {/* Truncated rather than wrapped: a label going to two lines would
                  make the whole bar taller for the sake of one word. */}
              <span className="w-full truncate text-center">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
