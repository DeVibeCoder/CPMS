import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useSidebar } from "@/store/sidebar";
import { usePageMetaStore } from "@/store/pageMeta";

export function Topbar() {
  const { collapsed, toggle } = useSidebar();
  const title = usePageMetaStore((s) => s.title);
  const description = usePageMetaStore((s) => s.description);

  return (
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

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
