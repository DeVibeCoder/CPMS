import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "@/config/nav";
import { useAuth, can } from "@/store/auth";
import { cn, roleLabel } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";
import { UserAvatar } from "@/components/common/UserAvatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps {
  /** Icon-only collapsed mode (desktop pref or tablet). */
  collapsed?: boolean;
  /** Called after navigating (used to close the mobile drawer). */
  onNavigate?: () => void;
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

const ROW = "flex h-11 shrink-0 items-center rounded-lg transition-colors";
const LABEL = "truncate whitespace-nowrap pr-3 text-sm font-medium";
const IDLE = "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white";
const ACTIVE = "bg-sidebar-accent text-white shadow-sm";

export function SidebarNav({ collapsed = false, onNavigate }: SidebarProps) {
  const user = useAuth((s) => s.user);

  const items = NAV_ITEMS.filter(
    (item) => !item.requires || can(user?.role, item.requires),
  );

  const name = user ? user.displayName || user.name : "";
  const row = ROW;
  const label = LABEL;

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
              className={({ isActive }) => cn(row, isActive ? ACTIVE : IDLE)}
            >
              <IconBox>
                <item.icon className="h-5 w-5" />
              </IconBox>
              {!collapsed && (
                <>
                  <span className={label}>{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto shrink-0 rounded-full bg-sidebar-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </MaybeTooltip>
        ))}
      </nav>

      {user && (
        <div className="shrink-0">
          {/* Who is signed in. Signing out lives in the top bar — same corner
              on desktop as it already is on mobile. */}
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
    </div>
  );
}
