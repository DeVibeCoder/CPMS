import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useSidebar } from "@/store/sidebar";
import { usePageMetaStore } from "@/store/pageMeta";
import { useAuth } from "@/store/auth";

export function Topbar() {
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebar();
  const title = usePageMetaStore((s) => s.title);
  const description = usePageMetaStore((s) => s.description);
  const logout = useAuth((s) => s.logout);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
        {/* Desktop: collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden shrink-0 lg:inline-flex"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>

        {/* Page title + description */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight text-foreground sm:text-lg">
            {title}
          </h1>
          {description && (
            <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
              {description}
            </p>
          )}
        </div>

        {/* Right controls — theme and sign out.
            Who is signed in is already on the sidebar's user card, so repeating
            it here would only cost space in a bar that has a page title to fit.

            The icon carries the destructive colour rather than waiting for a
            hover: this is the one control in the chrome that ends what you were
            doing, and it should look different from the rest before it is
            touched, not after. */}
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmOpen(true)}
            aria-label="Log out"
            title="Log out"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Log out?"
        description="You will be returned to the sign-in screen and any unsaved changes will be lost."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          logout();
          navigate("/login");
        }}
      />
    </>
  );
}
