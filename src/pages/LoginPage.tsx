import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  Factory,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/store/auth";

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#081b3a] via-[#0b2a5c] to-[#040d1f]" />
      {/* Animated blueprint grid */}
      <div className="blueprint-grid absolute inset-0 opacity-70" />
      {/* Soft glow orbs */}
      <motion.div
        className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl"
        animate={{ y: [0, 20, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-3xl"
        animate={{ y: [0, -24, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating industrial glyphs */}
      <Factory className="pointer-events-none absolute left-[12%] top-[18%] hidden h-16 w-16 text-white/5 lg:block animate-float" />
      <ShieldCheck
        className="pointer-events-none absolute bottom-[16%] right-[14%] hidden h-14 w-14 text-white/5 lg:block animate-float"
        style={{ animationDelay: "2s" }}
      />

      <div className="absolute right-4 top-4 z-20">
        <div className="text-white/80">
          <ThemeToggle />
        </div>
      </div>

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl shadow-glass lg:grid-cols-2">
        {/* Left brand panel */}
        <div className="relative hidden flex-col justify-between bg-white/5 p-10 backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <div className="text-lg font-bold text-white">CPSM</div>
              <div className="text-xs text-blue-200/70">
                Cement Plant Stock Management
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold leading-tight text-white">
              Daily stock,
              <br />
              under control.
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-blue-100/70">
              Replace the manual Word-to-PDF routine with a fast, accurate and
              auditable daily reporting workflow — built for the plant floor.
            </p>
            <div className="mt-8 space-y-3">
              {[
                "Auto-calculated totals, zero manual math",
                "Print-accurate PDF in one click",
                "Live dashboard & historical analytics",
              ].map((f) => (
                <div key={f} className="flex items-center gap-3 text-sm text-blue-50/90">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-400/20 text-blue-200">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  {f}
                </div>
              ))}
            </div>
          </motion.div>

          <div className="text-xs text-blue-200/50">
            © {new Date().getFullYear()} Cement Plant Industries
          </div>
        </div>

        {/* Right form panel — glass card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="bg-white/95 p-8 backdrop-blur-xl dark:bg-slate-900/90 sm:p-10"
        >
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Logo size={40} />
            <div className="text-base font-bold">CPSM</div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to access the stock management dashboard.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@cementplant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                />
                Remember me
              </label>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
