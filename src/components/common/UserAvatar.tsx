import { initials } from "@/lib/utils";
import type { User } from "@/types";

/**
 * Avatar: the uploaded picture when there is one, otherwise tinted initials.
 *
 * Shared by the sidebar and the top bar. It lived inside the sidebar until the
 * sign-out control moved to the top bar and needed the same face beside it —
 * two copies of this would have drifted the first time somebody changed a size.
 */
export function UserAvatar({ user, size = 32 }: { user: User; size?: number }) {
  const name = user.displayName || user.name;

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: user.avatarColor ?? "#1d4ed8",
        fontSize: size * 0.38,
      }}
    >
      {initials(name)}
    </span>
  );
}
