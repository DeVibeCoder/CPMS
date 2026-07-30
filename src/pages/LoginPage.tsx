import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  Eye,
  EyeOff,
  FileCheck2,
  Gauge,
  Loader2,
  Lock,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Logo } from "@/components/common/Logo";
import { APP_LONG_NAME, APP_NAME, ORG_NAME } from "@/config/brand";
import { useAuth } from "@/store/auth";

/**
 * Sign-in.
 *
 * A two-panel card: the form on the left, the plant on the right under a blue
 * gradient. The overlaid copy is kept to the lower third deliberately — the
 * photograph is the point, and text spread across it would leave neither the
 * words nor the silos readable.
 */

/** Selling points beside the form. Short enough to read at a glance. */
const FEATURES: Array<{ icon: LucideIcon; text: string }> = [
  { icon: Gauge, text: "Auto-calculated totals, zero manual math" },
  { icon: FileCheck2, text: "Print-accurate PDF in one click" },
  { icon: BarChart3, text: "Live dashboard & historical analytics" },
];

/**
 * The plant photograph.
 *
 * Referenced from `public/` rather than bundled so it can be swapped without a
 * rebuild. The gradient sits in its own layer above it, so if the file is
 * missing the panel still renders as a clean blue field rather than a broken
 * image — the login form must never depend on decoration.
 */
const PLANT_IMAGE = "/login-silos.jpg";

/**
 * A drifting background shape.
 *
 * Travel and duration are tuned together: the motion has to be slow enough to
 * feel calm but large enough to actually read as movement. Anything under about
 * 40px of travel reads as static however long it takes.
 */
interface Floater {
  /** Size, position, shape and colour. */
  className: string;
  /** Seconds for one full round trip. */
  duration: number;
  /** Stagger, so the shapes never move in lockstep. */
  delay: number;
  /** Vertical travel in px. */
  y: number;
  /** Horizontal travel in px. */
  x: number;
  /** Degrees of rotation, for the angular shapes. */
  rotate?: number;
}

/**
 * The background.
 *
 * Every shape is the application's own blue (`primary`) — one flat colour, no
 * gradients and no blur. Depth comes from size and opacity alone, which keeps
 * the page unmistakably on-brand instead of introducing a second accent hue.
 *
 * Deliberately a small set: the login form is the subject, and a busy background
 * would compete with it.
 */
const FLOATERS: Floater[] = [
  // ---- Large shapes. Low opacity so scale reads as distance, not weight. ----
  {
    className:
      "left-[-11rem] top-[-9rem] h-[28rem] w-[28rem] rounded-full bg-primary/[0.07] dark:bg-primary/20",
    duration: 18,
    delay: 0,
    y: 70,
    x: 45,
  },
  {
    className:
      "bottom-[-13rem] right-[-7rem] h-[30rem] w-[30rem] rounded-full bg-primary/[0.06] dark:bg-primary/[0.16]",
    duration: 22,
    delay: 1.5,
    y: 85,
    x: -55,
  },
  {
    className:
      "left-[46%] top-[-12rem] h-[20rem] w-[20rem] rounded-full bg-primary/[0.05] dark:bg-primary/[0.14]",
    duration: 26,
    delay: 3,
    y: 60,
    x: -35,
  },

  // ---- Mid-size outlines. These carry most of the visible movement. ----
  {
    // Large ring, upper left.
    className:
      "left-[6%] top-[16%] h-32 w-32 rounded-full border-2 border-primary/30 dark:border-primary/50 sm:h-40 sm:w-40",
    duration: 14,
    delay: 0.4,
    y: 80,
    x: 30,
  },
  {
    // Rotating rounded square, lower left.
    className:
      "bottom-[12%] left-[12%] h-20 w-20 rounded-2xl border-2 border-primary/25 bg-primary/[0.08] dark:border-primary/45 dark:bg-primary/[0.14] sm:h-24 sm:w-24",
    duration: 17,
    delay: 2,
    y: -70,
    x: 40,
    rotate: 45,
  },
  {
    // Medium ring, upper right.
    className:
      "right-[7%] top-[10%] h-24 w-24 rounded-full border-2 border-primary/25 dark:border-primary/45 sm:h-28 sm:w-28",
    duration: 16,
    delay: 0.8,
    y: 75,
    x: -32,
  },
  {
    // Rotating diamond, lower right.
    className:
      "bottom-[16%] right-[14%] h-16 w-16 rotate-12 rounded-xl border-2 border-primary/25 bg-primary/[0.08] dark:border-primary/45 dark:bg-primary/[0.14] sm:h-20 sm:w-20",
    duration: 19,
    delay: 2.6,
    y: -65,
    x: -35,
    rotate: -60,
  },

  // ---- Small solid dots. Strongest opacity, because they are tiny. ----
  {
    className:
      "left-[22%] top-[58%] h-10 w-10 rounded-full bg-primary/25 dark:bg-primary/45",
    duration: 11,
    delay: 1,
    y: 55,
    x: -28,
  },
  {
    className:
      "left-[38%] top-[6%] h-6 w-6 rounded-full bg-primary/25 dark:bg-primary/45",
    duration: 13,
    delay: 3.2,
    y: 48,
    x: 34,
  },
];

function FloatingShape({ floater }: { floater: Floater }) {
  const { className, duration, delay, x, y, rotate } = floater;
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute ${className}`}
      animate={{
        y: [0, y, 0],
        x: [0, x, 0],
        ...(rotate !== undefined ? { rotate: [0, rotate, 0] } : {}),
      }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, loading, error } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ??
    "/dashboard";

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(email, password, remember);
    if (ok) navigate(from, { replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 p-4 dark:bg-slate-950 sm:p-6">
      {/* ---- Background: flat field + slowly drifting objects ----
          A flat fill rather than a gradient, so the blue shapes above it read as
          one consistent colour at every position on the page. */}
      <div className="absolute inset-0 bg-slate-50 dark:bg-[#081b3a]" />

      {FLOATERS.map((floater, i) => (
        <FloatingShape key={i} floater={floater} />
      ))}

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* ---- The card ---- */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-3xl bg-card shadow-elevated ring-1 ring-black/5 dark:ring-white/10 lg:grid-cols-2"
      >
        {/* ---- Mobile banner ----
            The right-hand panel is desktop-only, so on a phone the plant and the
            positioning line would disappear altogether. This keeps both, at a
            height that still leaves the form above the fold. */}
        <div className="relative h-40 overflow-hidden sm:h-48 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-800 bg-cover bg-center"
            style={{ backgroundImage: `url(${PLANT_IMAGE})` }}
            role="img"
            aria-label="Cement silos at the plant"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-primary/25 to-blue-900/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-blue-950/90 via-blue-950/25 to-transparent" />
          <div className="relative flex h-full flex-col justify-end p-5">
            <div className="flex items-center gap-2">
              <Logo size={26} tone="onDark" />
              <span className="text-xl font-bold tracking-tight text-white">
                {APP_NAME}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-blue-50/90">
              Manage production, inventory, and daily reports from one
              centralized platform.
            </p>
          </div>
        </div>

        {/* ---- Left: the form ---- */}
        <div className="flex flex-col justify-center px-6 py-8 sm:px-12 sm:py-14">
          {/* The banner above already carries the branding on mobile, so the
              heading only appears where there is no banner. */}
          <div className="mb-8 hidden text-center lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Welcome to
            </p>
            <div className="mt-2.5 flex items-center justify-center gap-2.5">
              <Logo size={34} />
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {APP_NAME}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{APP_LONG_NAME}</p>
          </div>

          <div className="mb-6 lg:hidden">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Sign in to continue.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-full pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-full pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(Boolean(v))}
              />
              Remember me
            </label>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="h-12 w-full rounded-full text-[15px] font-semibold shadow-lg shadow-primary/25"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in…" : "SIGN IN"}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            {ORG_NAME}
          </p>
        </div>

        {/* ---- Right: the plant, under a blue gradient ---- */}
        <div className="relative hidden min-h-[34rem] overflow-hidden lg:block">
          {/* The photograph */}
          <div
            className="absolute inset-0 bg-slate-800 bg-cover bg-center"
            style={{ backgroundImage: `url(${PLANT_IMAGE})` }}
            role="img"
            aria-label="Cement silos at the plant"
          />
          {/* Brand tint — kept light on purpose. A heavier wash turns the plant
              into a blue rectangle, which defeats the point of using a photo. */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-primary/25 to-blue-900/45" />
          {/* Scrim under the copy only. Legible text at the bottom without
              washing out the silos above it. */}
          <div className="absolute inset-0 bg-gradient-to-t from-blue-950/90 via-blue-950/30 to-transparent" />

          {/* Copy — confined to the lower portion so it never covers the whole
              image, which is what the reference layout does too. */}
          <div className="relative flex h-full flex-col justify-end p-10 xl:p-12">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.55 }}
            >
              <div className="flex items-center gap-2.5">
                <Logo size={30} tone="onDark" />
                <span className="text-2xl font-bold tracking-tight text-white">
                  {APP_NAME}
                </span>
              </div>
              <p className="mt-1 text-[13px] font-medium text-blue-100/80">
                {APP_LONG_NAME}
              </p>

              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-blue-50/95">
                Manage production, inventory, and daily reports from one
                centralized platform.
              </p>

              <ul className="mt-6 space-y-2.5">
                {FEATURES.map((f) => (
                  <li
                    key={f.text}
                    className="flex items-center gap-3 text-sm text-blue-50/90"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/20">
                      <f.icon className="h-3.5 w-3.5" />
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
