import { cn } from "@/lib/utils";

/** CPSM mark — a stylised cement silo / industrial glyph. */
export function Logo({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-700 text-white shadow-sm",
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
