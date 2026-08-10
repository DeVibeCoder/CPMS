// =============================================================================
// Vercel cron endpoint — keeps the Supabase project from pausing.
//
// Scheduled daily in vercel.json. Supabase pauses free projects after 7 days
// without activity, and counts ordinary API requests as activity — so a single
// read is enough. Daily use by the plant already keeps the project awake; this
// covers shutdowns, holidays and quiet weeks, when nobody opens the app for a
// fortnight and the backend everyone depends on goes to sleep.
//
// Answering non-2xx on failure is deliberate: Vercel records the cron
// invocation as failed, so a keepalive that has quietly stopped working shows
// in the dashboard instead of being discovered by a locked-out user.
// =============================================================================
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET?.trim();

  // Refuse to run unguarded. Without the secret this route is a public button
  // that queries the production project.
  if (!secret) {
    return res
      .status(500)
      .json({ ok: false, error: "CRON_SECRET is not set on this deployment." });
  }
  // Vercel attaches this header to cron invocations automatically.
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized." });
  }

  const url = process.env.VITE_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return res.status(500).json({
      ok: false,
      error: "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  try {
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.from("settings").select("id").eq("id", "app").single();
    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true, touchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(503).json({
      ok: false,
      error: e.message,
      hint: "The project is not answering — check https://supabase.com/dashboard",
    });
  }
}
