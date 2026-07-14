import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { usePageMetaStore } from "@/store/pageMeta";

/**
 * Slim mobile top bar. Shows the app mark + page title on a tab screen, or a
 * back button on a focused (pushed) screen — a native-style app bar.
 */
export function MobileHeader({ focused }: { focused: boolean }) {
  const navigate = useNavigate();
  const title = usePageMetaStore((s) => s.title);
  const description = usePageMetaStore((s) => s.description);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur">
      {focused ? (
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground active:bg-accent"
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

      <ThemeToggle />
    </header>
  );
}
