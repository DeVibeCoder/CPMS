// =============================================================================
// Vercel cron endpoint — keeps the backends from pausing on their free plans.
//
// Scheduled daily in vercel.json. Vercel's Hobby plan runs crons once a day,
// which is fine: both pause thresholds are 7 days, so six consecutive runs can
// fail before anything breaks.
//
// It touches BOTH backends while the migration's fallback window is open:
//
//   Supabase — where the app now lives. Supabase counts ordinary API requests as
//     activity, so a single read is enough. Daily use by the plant already keeps
//     it awake; this covers shutdowns, holidays and quiet weeks.
//
//   Appwrite — the rollback target. Appwrite explicitly does NOT count runtime
//     traffic, only development activity in the console, so keeping it alive
//     needs a real schema write. See appwrite/keepalive.mjs for why that is a
//     best guess at an undocumented signal rather than a guarantee.
//
// The Appwrite half is skipped when APPWRITE_API_KEY is absent, so removing that
// backend at the end of the migration is a matter of clearing one environment
// variable — this route keeps working and simply stops touching it.
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import { isProjectReachable, touchProject } from "../appwrite/keepalive.mjs";

/** One read against Postgres. Enough for Supabase, which counts API requests. */
async function touchSupabase({ url, serviceKey }) {
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.from("settings").select("id").eq("id", "app").single();
  if (error) throw new Error(error.message);
  return { touchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET?.trim();

  // Refuse to run unguarded. Without the secret this route is a public button
  // that writes schema to the production project.
  if (!secret) {
    return res
      .status(500)
      .json({ ok: false, error: "CRON_SECRET is not set on this deployment." });
  }
  // Vercel attaches this header to cron invocations automatically.
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized." });
  }

  const results = {};
  const failures = [];

  // ---- Supabase ----
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    results.supabase = { ok: false, error: "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." };
    failures.push("supabase");
  } else {
    try {
      results.supabase = { ok: true, ...(await touchSupabase({ url: supabaseUrl, serviceKey })) };
    } catch (e) {
      results.supabase = { ok: false, error: e.message };
      failures.push("supabase");
    }
  }

  // ---- Appwrite (only while it is still the rollback target) ----
  const endpoint = process.env.VITE_APPWRITE_ENDPOINT?.trim();
  const projectId = process.env.VITE_APPWRITE_PROJECT_ID?.trim();
  const apiKey = process.env.APPWRITE_API_KEY?.trim();
  const databaseId = process.env.VITE_APPWRITE_DATABASE_ID?.trim() || "cpsm";

  if (!endpoint || !projectId || !apiKey) {
    results.appwrite = { skipped: true, reason: "Not configured — no longer kept alive." };
  } else {
    try {
      const { touchedAt, hadLeftover } = await touchProject({
        endpoint,
        projectId,
        apiKey,
        databaseId,
      });
      results.appwrite = { ok: true, touchedAt, hadLeftover };
    } catch (e) {
      const paused = !(await isProjectReachable({ endpoint, projectId, apiKey }));
      results.appwrite = {
        ok: false,
        paused,
        error: e.message,
        hint: paused
          ? "The project is not answering — restore it at https://cloud.appwrite.io/console"
          : "The project is up but the schema write failed. Check the API key scopes.",
      };
      failures.push("appwrite");
    }
  }

  // Answering non-2xx is deliberate: Vercel records the cron invocation as
  // failed, so a keepalive that has quietly stopped working shows up in the
  // dashboard instead of being discovered by a locked-out user.
  const status = failures.length === 0 ? 200 : results.supabase.ok ? 500 : 503;
  return res.status(status).json({ ok: failures.length === 0, failures, ...results });
}
