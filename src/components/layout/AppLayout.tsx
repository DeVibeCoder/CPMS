import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { SidebarNav } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "@/components/mobile/BottomNav";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { useSidebar } from "@/store/sidebar";
import { useIsDesktop, useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/** Focused "pushed" screens hide the bottom tab bar (native detail-screen feel). */
function isFocusedRoute(pathname: string): boolean {
  return pathname.startsWith("/reports/"); // new, view, edit
}

export function AppLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const collapsedPref = useSidebar((s) => s.collapsed);
  const collapsed = isDesktop ? collapsedPref : true;
  const focused = isFocusedRoute(location.pathname);

  // Native-style enter transition, re-keyed per navigation.
  const page = (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: isMobile ? 10 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <Outlet />
    </motion.div>
  );

  // ---------- Mobile shell ----------
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
        <MobileHeader focused={focused} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div
            className={cn(
              "px-4 py-4",
              focused ? "pb-4" : "pb-24", // clear the bottom nav
            )}
          >
            {page}
          </div>
        </main>
        {!focused && <BottomNav />}
      </div>
    );
  }

  // ---------- Desktop / tablet shell ----------
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border md:block",
          "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <SidebarNav collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-8 md:py-7">
            {page}
          </div>
        </main>
      </div>
    </div>
  );
}
