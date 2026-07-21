import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  History,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Settings,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cn, initials, roleLabel } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { useTheme } from "@/store/theme";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

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
    label: "Analytics",
    to: "/analytics",
    icon: BarChart3,
    match: (p) => p.startsWith("/analytics"),
  },
];

interface MenuLink {
  label: string;
  to: string;
  icon: LucideIcon;
}

// Settings is a hub — Users & Profile are tabs inside it.
const MENU_LINKS: MenuLink[] = [
  { label: "Settings", to: "/settings", icon: Settings },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const menuLinks = MENU_LINKS;
  const menuActive =
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/users") ||
    location.pathname.startsWith("/profile");

  const name = user ? user.displayName || user.name : "";

  const go = (to: string) => {
    setMenuOpen(false);
    navigate(to);
  };

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground",
    );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg pb-safe">
        <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1">
          {TABS.map((tab) => {
            const active = tab.match(location.pathname);
            return (
              <NavLink key={tab.to} to={tab.to} className={tabClass(active)}>
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/12",
                  )}
                >
                  <tab.icon className="h-[22px] w-[22px]" />
                </span>
                {tab.label}
              </NavLink>
            );
          })}
          <button
            onClick={() => setMenuOpen(true)}
            className={tabClass(menuActive || menuOpen)}
          >
            <span
              className={cn(
                "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                (menuActive || menuOpen) && "bg-primary/12",
              )}
            >
              <MenuIcon className="h-[22px] w-[22px]" />
            </span>
            Menu
          </button>
        </div>
      </nav>

      {/* Menu bottom sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent>
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {user && (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={name}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-base font-semibold text-white"
                  style={{ backgroundColor: user.avatarColor ?? "#1d4ed8" }}
                >
                  {initials(name)}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{name}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {roleLabel(user.role)}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {menuLinks.map((link) => (
              <button
                key={link.to}
                onClick={() => go(link.to)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[15px] font-medium transition-colors hover:bg-accent active:bg-accent"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <link.icon className="h-5 w-5" />
                </span>
                {link.label}
              </button>
            ))}

            <button
              onClick={toggle}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[15px] font-medium transition-colors hover:bg-accent active:bg-accent"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {isDark ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </span>
              {isDark ? "Light Mode" : "Dark Mode"}
            </button>

            <div className="my-1 h-px bg-border" />

            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[15px] font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/12">
                <LogOut className="h-5 w-5" />
              </span>
              Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Log out?"
        description="You will be returned to the sign-in screen."
        confirmLabel="Log out"
        cancelLabel="Cancel"
        onConfirm={() => {
          logout();
          navigate("/login");
        }}
      />
    </>
  );
}
