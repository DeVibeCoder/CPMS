import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, can, type Capability } from "@/store/auth";

/** Requires an authenticated session, else redirects to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** Requires a capability, else redirects to the dashboard. */
export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const user = useAuth((s) => s.user);
  if (!can(user?.role, capability)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
