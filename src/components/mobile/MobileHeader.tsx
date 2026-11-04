import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { usePageMetaStore } from "@/store/pageMeta";
import { can, useAuth } from "@/store/auth";
import { initials } from "@/lib/utils";

/**
 * Slim mobile top bar. Shows the app mark + page title on a tab screen, or a
 * back button on a focused (pushed) screen — a native-style app bar.
 *
 * The account controls live here rather than behind a bottom-bar menu: the
 * bottom bar is for navigation between sections, and theme/sign-out/profile are
 * account actions, which sit top-right on every platform convention.
 */
export function MobileHeader({ focused }: { focused: boolean }) {
  const navigate = useNavigate();
  const title = usePageMetaStore((s) => s.title);
  const description = usePageMetaStore((s) => s.description);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const canOpenProfile = can(user?.role, "accountSettings");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const name = user ? user.displayName || user.name : "";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur">
        {focused ? (
          <button
            // A focused screen opened from a link has nothing behind it to go
            // back to, and every focused screen is under Reports. The router
            // numbers its history entries from 0 on a fresh load, and signing in
            // replaces an entry rather than adding one, so idx covers that too.
            onClick={() =>
              window.history.state?.idx > 0
                ? navigate(-1)
                : navigate("/reports")
            }
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Logo size={30} />
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          <button
            onClick={() => setConfirmOpen(true)}
            aria-label="Log out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
          >
            <LogOut className="h-[1.15rem] w-[1.15rem]" />
          </button>
          {user && (
            <button
              onClick={() => navigate("/settings/profile")}
              disabled={!canOpenProfile}
              aria-label={canOpenProfile ? `${name} — open profile` : name}
              className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={name}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: user.avatarColor ?? "#1d4ed8" }}
                >
                  {initials(name)}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

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
