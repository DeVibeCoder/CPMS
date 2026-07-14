import { useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarNav } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/store/sidebar";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const collapsedPref = useSidebar((s) => s.collapsed);

  // Desktop honours the user's collapse preference; tablet (md–lg) is always
  // compact; mobile (<md) uses the slide-in drawer instead.
  const collapsed = isDesktop ? collapsedPref : true;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Persistent sidebar (tablet + desktop) */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border md:block",
          "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-full max-w-[17rem] translate-x-0 translate-y-0 gap-0 border-0 p-0 sm:rounded-none data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <DialogTitle className="sr-only">Navigation menu</DialogTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-8 md:py-7 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
