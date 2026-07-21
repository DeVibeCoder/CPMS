import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Building2, UserCircle, Users, type LucideIcon } from "lucide-react";
import { useAuth, can, type Capability } from "@/store/auth";
import { usePageMeta } from "@/store/pageMeta";
import { cn } from "@/lib/utils";

interface SettingsTab {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Capability needed to see the tab (undefined = everyone). */
  requires?: Capability;
  title: string;
  description: string;
}

/** Sub-sections that used to be their own sidebar items, now grouped here. */
const SETTINGS_TABS: SettingsTab[] = [
  {
    label: "General",
    to: "/settings/general",
    icon: Building2,
    requires: "settings",
    title: "Settings",
    description: "Configure application preferences.",
  },
  {
    label: "Users",
    to: "/settings/users",
    icon: Users,
    requires: "manageUsers",
    title: "Users",
    description: "Manage system users and permissions.",
  },
  {
    label: "Profile",
    to: "/settings/profile",
    icon: UserCircle,
    title: "Profile",
    description: "Manage your account information.",
  },
];

/** First sub-section the current role is allowed to open. */
export function firstSettingsPath(role: Parameters<typeof can>[0]): string {
  const tab = SETTINGS_TABS.find((t) => !t.requires || can(role, t.requires));
  return tab?.to ?? "/settings/profile";
}

/** Bare `/settings` — send the user to their first accessible sub-section. */
export function SettingsIndex() {
  const role = useAuth((s) => s.user?.role);
  return <Navigate to={firstSettingsPath(role)} replace />;
}

/** Shell that renders the settings tab bar + the active sub-section. */
export function SettingsLayout() {
  const role = useAuth((s) => s.user?.role);
  const location = useLocation();

  const tabs = SETTINGS_TABS.filter((t) => !t.requires || can(role, t.requires));
  const active =
    tabs.find((t) => location.pathname.startsWith(t.to)) ?? tabs[0];

  usePageMeta(active?.title ?? "Settings", active?.description ?? "");

  return (
    <div>
      {/* Only show the tab bar when there's more than one section to switch. */}
      {tabs.length > 1 && (
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border scrollbar-thin">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </NavLink>
          ))}
        </div>
      )}

      <Outlet />
    </div>
  );
}
