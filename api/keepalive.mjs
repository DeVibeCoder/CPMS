// =============================================================================
// Vercel cron endpoint — keeps the Appwrite Free plan project from pausing.
//
// Scheduled daily in vercel.json. Vercel's Hobby plan only runs crons once a
// day, which is fine: the pause threshold is 7 days, so six consecutive runs
// can fail before anything breaks.
//
// See appwrite/keepalive.mjs for what "keeping it alive" actually does and why
// it is a best guess rather than a guarantee.
// =============================================================================
import { isProjectReachable, touchProject } from "../appwrite/keepalive.mjs";

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

  const endpoint = process.env.VITE_APPWRITE_ENDPOINT?.trim();
  const projectId = process.env.VITE_APPWRITE_PROJECT_ID?.trim();
  const apiKey = process.env.APPWRITE_API_KEY?.trim();
  const databaseId = process.env.VITE_APPWRITE_DATABASE_ID?.trim() || "cpsm";

  if (!endpoint || !projectId || !apiKey) {
    return res.status(500).json({
      ok: false,
      error:
        "Missing VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID or APPWRITE_API_KEY.",
    });
  }

  try {
    const { touchedAt, hadLeftover } = await touchProject({
      endpoint,
      projectId,
      apiKey,
      databaseId,
    });
    return res.status(200).json({ ok: true, touchedAt, hadLeftover });
  } catch (e) {
    // Answering non-2xx is deliberate: Vercel records the cron invocation as
    // failed, so a keepalive that has quietly stopped working shows up in the
    // dashboard instead of being discovered by a locked-out user.
    const paused = !(await isProjectReachable({ endpoint, projectId, apiKey }));
    return res.status(paused ? 503 : 500).json({
      ok: false,
      paused,
      error: e.message,
      hint: paused
        ? "The project is not answering — restore it at https://cloud.appwrite.io/console"
        : "The project is up but the schema write failed. Check the API key scopes.",
    });
  }
}
