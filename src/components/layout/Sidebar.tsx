import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/config/nav";
import { useAuth, can } from "@/store/auth";
import { cn, initials, roleLabel } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { User } from "@/types";

interface SidebarProps {
  /** Icon-only collapsed mode (desktop pref or tablet). */
  collapsed?: boolean;
  /** Called after navigating (used to close the mobile drawer). */
  onNavigate?: () => void;
}

/** Avatar: uploaded picture when available, otherwise tinted initials. */
function UserAvatar({ user, size = 32 }: { user: User; size?: number }) {
  const name = user.displayName || user.name;
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: user.avatarColor ?? "#1d4ed8",
        fontSize: size * 0.38,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Optionally wraps a trigger in a right-side tooltip (used when collapsed). */
function MaybeTooltip({
  show,
  label,
  children,
}: {
  show: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Fixed-size leading icon box. Its width equals the collapsed content width, so
 * every icon (and the avatar) is centred in the collapsed rail *and* sits at the
 * exact same x-position when expanded — nothing shifts horizontally on toggle.
 */
function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const items = NAV_ITEMS.filter(
    (item) => !item.requires || can(user?.role, item.requires),
  );

  const doLogout = () => {
    logout();
    navigate("/login");
  };

  const name = user ? user.displayName || user.name : "";
  const row = "flex h-11 shrink-0 items-center rounded-lg transition-colors";
  const label = "truncate whitespace-nowrap pr-3 text-sm font-medium";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center px-3">
        <IconBox>
          <Logo size={34} />
        </IconBox>
        {!collapsed && (
          <div className="overflow-hidden whitespace-nowrap pl-1 leading-tight">
            <div className="text-sm font-bold text-white">CPSM</div>
            <div className="text-[11px] text-sidebar-foreground/70">
              Cement Plant Stock Management
            </div>
          </div>
        )}
      </div>

      {/* Continuous nav list (no section headers) */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-2">
        {items.map((item) => (
          <MaybeTooltip key={item.to} show={collapsed} label={item.label}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  row,
                  isActive
                    ? "bg-sidebar-accent text-white shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
                )
              }
            >
              <IconBox>
                <item.icon className="h-5 w-5" />
              </IconBox>
              {!collapsed && <span className={label}>{item.label}</span>}
            </NavLink>
          </MaybeTooltip>
        ))}
      </nav>

      {user && (
        <div className="shrink-0">
          {/* Logout — directly above the user-details divider */}
          <div className="px-3 pb-2">
            <MaybeTooltip show={collapsed} label="Log out">
              <button
                onClick={() => setConfirmOpen(true)}
                className={cn(
                  row,
                  "w-full text-sidebar-foreground/80 hover:bg-red-500/15 hover:text-red-300",
                )}
              >
                <IconBox>
                  <LogOut className="h-5 w-5" />
                </IconBox>
                {!collapsed && <span className={label}>Log out</span>}
              </button>
            </MaybeTooltip>
          </div>

          {/* User details */}
          <div className="border-t border-sidebar-border px-3 py-3">
            <MaybeTooltip
              show={collapsed}
              label={`${name} · ${roleLabel(user.role)}`}
            >
              <div className="flex items-center">
                <IconBox>
                  <UserAvatar user={user} size={32} />
                </IconBox>
                {!collapsed && (
                  <div className="min-w-0 flex-1 overflow-hidden pl-1">
                    <div className="truncate whitespace-nowrap text-[15px] font-semibold leading-tight text-white">
                      {name}
                    </div>
                    <div className="truncate whitespace-nowrap text-xs text-sidebar-foreground/60">
                      {roleLabel(user.role)}
                    </div>
                  </div>
                )}
              </div>
            </MaybeTooltip>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Log out?"
        description="You will be returned to the sign-in screen and any unsaved changes will be lost."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={doLogout}
      />
    </div>
  );
}
