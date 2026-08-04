import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/brand";

/**
 * The CPSM mark.
 *
 * Renders `public/icon-180.png` — a 180px derivative of the master artwork in
 * `public/icon.png`, which at 1254px is far too heavy to hand to a 30px slot in
 * the sidebar. 180px still covers the largest use (56px) at 3x device pixel
 * ratio, and the same file backs the iOS home-screen icon.
 */
export function Logo({
  className,
  size = 36,
  tone = "brand",
}: {
  className?: string;
  size?: number;
  /**
   * The artwork is blue on an opaque white field, so it carries its own
   * contrast on either surface and is never recoloured. `tone` only settles how
   * the tile edge is drawn: `brand` gets a hairline that keeps it from
   * dissolving into a white card, `onDark` a lighter ring that reads over a
   * photograph or a dark panel.
   */
  tone?: "brand" | "onDark";
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white",
        tone === "brand"
          ? "ring-1 ring-inset ring-black/[7%] shadow-sm"
          : "ring-1 ring-inset ring-white/30",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/icon-180.png"
        alt={APP_NAME}
        width={size}
        height={size}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
