import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  History,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Active when the path starts with this (for nested routes). */
  match: (path: string) => boolean;
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

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg pb-safe">
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1">
        {TABS.map((tab) => {
          const active = tab.match(location.pathname);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                  active && "bg-primary/[12%]",
                )}
              >
                <tab.icon className="h-[22px] w-[22px]" />
              </span>
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
