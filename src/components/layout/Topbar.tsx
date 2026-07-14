import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useAuth } from "@/store/auth";
import { useSidebar } from "@/store/sidebar";
import { usePageMetaStore } from "@/store/pageMeta";
import { initials, roleLabel } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Topbar() {
  const user = useAuth((s) => s.user);
  const { collapsed, toggle } = useSidebar();
  const title = usePageMetaStore((s) => s.title);
  const description = usePageMetaStore((s) => s.description);

  const name = user ? user.displayName || user.name : "";

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
        {user && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={name}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: user.avatarColor ?? "#1d4ed8" }}
                >
                  {initials(name)}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              <div className="font-medium">{name}</div>
              <div className="text-[11px] opacity-80">
                {roleLabel(user.role)}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
