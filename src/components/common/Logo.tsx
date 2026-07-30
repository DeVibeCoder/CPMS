import { cn } from "@/lib/utils";

/** CPSM mark — a stylised cement silo / industrial glyph. */
export function Logo({
  className,
  size = 36,
  tone = "brand",
}: {
  className?: string;
  size?: number;
  /**
   * `brand` is the blue tile used on light surfaces. `onDark` is a translucent
   * tile for use over a photograph or a dark panel — filtering the brand tile to
   * white instead would flatten the glyph into a solid block, since the mark is
   * already white on blue.
   */
  tone?: "brand" | "onDark";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg text-white",
        tone === "brand"
          ? "bg-gradient-to-br from-primary to-blue-700 shadow-sm"
          : "bg-white/15 ring-1 ring-inset ring-white/30 backdrop-blur-sm",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 22 L16 5 L26 22 Z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <rect
          x="10"
          y="22"
          width="12"
          height="5"
          rx="1"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
