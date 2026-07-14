import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SwipeCardsProps {
  children: ReactNode[];
  /** Peek width of the next card (percentage of viewport). */
  className?: string;
}

/**
 * A horizontally swipeable row of snap cards with pagination dots — a native
 * carousel feel using CSS scroll-snap (no JS animation, momentum-friendly).
 */
export function SwipeCards({ children, className }: SwipeCardsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = children.filter(Boolean);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const width = el.clientWidth;
    const idx = Math.round(el.scrollLeft / width);
    if (idx !== active) setActive(idx);
  };

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={className}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth scrollbar-none"
      >
        {items.map((child, i) => (
          <div
            key={i}
            className="w-full shrink-0 snap-center"
            style={{ scrollSnapStop: "always" }}
          >
            {child}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to card ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
