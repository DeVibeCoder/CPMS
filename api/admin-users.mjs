// =============================================================================
// admin-users — privileged user management.
//
// Creating an account, deleting one, changing somebody's role, enabling or
// disabling them, or resetting their password all require the Supabase service
// key, which must never reach the browser. This route is the only place that key
// is used. It re-checks on every call that the caller is a signed-in
// administrator; being able to reach the endpoint is not by itself permission to
// use it.
//
// The caller identifies itself with its own access token in the Authorization
// header. The token is verified against Supabase rather than trusted, so it
// cannot be forged the way a plain user-id header could.
//
// This replaces the Appwrite function in appwrite/functions/admin-users, and
// keeps its behaviour: the same actions, the same guards, and the same rule that
// an account whose profile row fails to create is deleted rather than left
// unable to sign in.
// =============================================================================
import { createClient } from "@supabase/supabase-js";

const ROLES = ["admin", "dispatch", "viewer"];
const MIN_PASSWORD = 8;

/** GoTrue disables an account by banning it. A century is "indefinitely". */
const BAN_FOREVER = "876000h";
const BAN_NONE = "none";

const TABLE_PROFILES = "profiles";

/** The role is the account claim, never anything the client sent. */
const roleFromAccount = (account) => {
  const claim = account?.app_metadata?.role;
  return ROLES.includes(claim) ? claim : "viewer";
};

const isActive = (account) =>
  !account.banned_until || new Date(account.banned_until) <= new Date();

function toUser(account, row) {
  return {
    id: account.id,
    name: row?.name ?? account.user_metadata?.name ?? account.email?.split("@")[0],
    displayName: row?.display_name ?? undefined,
    username: row?.username ?? undefined,
    email: account.email,
    role: roleFromAccount(account),
    active: isActive(account),
    createdAt: account.created_at,
    lastLogin: row?.last_login ?? undefined,
    avatarColor: row?.avatar_color ?? undefined,
    avatarUrl: row?.avatar_url ?? undefined,
  };
}

/** Only the columns a profile row stores, with undefined dropped. */
function profileFields(body) {
  const fields = {
    name: body.name,
    display_name: body.displayName,
    username: body.username,
    avatar_color: body.avatarColor,
    avatar_url: body.avatarUrl,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  );
}

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return res.status(500).json({
      error:
        "User management is not configured. Set VITE_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY on the deployment.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body." });
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  // ---- Admin client: bypasses RLS. Only used after the check below. ----
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Authenticate and authorise the caller ----
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Not signed in." });

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerError || !caller) {
    return res.status(401).json({ error: "Not signed in." });
  }
  if (!isActive(caller) || roleFromAccount(caller) !== "admin") {
    return res.status(403).json({ error: "Administrator access required." });
  }

  const readProfile = async (id) => {
    const { data } = await admin
      .from(TABLE_PROFILES)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ?? null;
  };

  try {
    switch (body.action) {
      // -----------------------------------------------------------------------
      case "list": {
        const accounts = [];
        for (let page = 1; ; page++) {
          const { data, error } = await admin.auth.admin.listUsers({
            page,
            perPage: 100,
          });
          if (error) throw error;
          accounts.push(...data.users);
          if (data.users.length < 100) break;
        }

        const { data: rows, error } = await admin
          .from(TABLE_PROFILES)
          .select("*");
        if (error) throw error;
        const byId = new Map(rows.map((r) => [r.id, r]));

        // An account with no profile row was created outside the app and cannot
        // sign in, so it is not part of the user list.
        return res.status(200).json({
          users: accounts
            .filter((a) => byId.has(a.id))
            .map((a) => toUser(a, byId.get(a.id)))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        });
      }

      // -----------------------------------------------------------------------
      case "create": {
        const { email, password, role = "viewer" } = body;
        if (!email || !password) {
          return res.status(400).json({ error: "Email and password are required." });
        }
        if (password.length < MIN_PASSWORD) {
          return res
            .status(400)
            .json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
        }
        if (!ROLES.includes(role)) {
          return res.status(400).json({ error: `Unknown role "${role}".` });
        }

        const name = body.name || email.split("@")[0];
        const { data: created, error: createError } =
          await admin.auth.admin.createUser({
            email,
            password,
            // There is no mail flow in a plant app: an administrator creating an
            // account is the confirmation.
            email_confirm: true,
            app_metadata: { role },
            user_metadata: { name },
            ban_duration: body.active === false ? BAN_FOREVER : undefined,
          });
        if (createError) throw createError;

        const account = created.user;
        const { error: profileError } = await admin.from(TABLE_PROFILES).insert({
          id: account.id,
          name,
          display_name: body.displayName ?? null,
          username: body.username ?? email.split("@")[0],
          avatar_color: body.avatarColor ?? null,
          avatar_url: body.avatarUrl ?? null,
          last_login: null,
        });
        if (profileError) {
          // Never leave an account that cannot sign in behind.
          await admin.auth.admin.deleteUser(account.id).catch(() => {});
          throw profileError;
        }

        const { data: fresh } = await admin.auth.admin.getUserById(account.id);
        return res
          .status(200)
          .json({ user: toUser(fresh.user, await readProfile(account.id)) });
      }

      // -----------------------------------------------------------------------
      case "update": {
        if (!body.id) return res.status(400).json({ error: "A user id is required." });

        const { data: targetData, error: targetError } =
          await admin.auth.admin.getUserById(body.id);
        if (targetError || !targetData?.user) {
          return res.status(404).json({ error: "User not found." });
        }
        const target = targetData.user;

        const accountPatch = {};

        if (body.role !== undefined) {
          if (!ROLES.includes(body.role)) {
            return res.status(400).json({ error: `Unknown role "${body.role}".` });
          }
          if (body.id === caller.id && body.role !== "admin") {
            return res
              .status(400)
              .json({ error: "You cannot remove your own administrator role." });
          }
          // Merge rather than replace, so a role change never quietly drops a
          // claim some other integration put there.
          accountPatch.app_metadata = { ...target.app_metadata, role: body.role };
        }

        if (body.active !== undefined) {
          if (body.id === caller.id && body.active === false) {
            return res
              .status(400)
              .json({ error: "You cannot disable your own account." });
          }
          accountPatch.ban_duration = body.active ? BAN_NONE : BAN_FOREVER;
        }

        if (body.password) {
          if (body.password.length < MIN_PASSWORD) {
            return res
              .status(400)
              .json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
          }
          accountPatch.password = body.password;
        }

        if (Object.keys(accountPatch).length > 0) {
          const { error } = await admin.auth.admin.updateUserById(
            body.id,
            accountPatch,
          );
          if (error) throw error;
        }

        const fields = profileFields(body);
        if (Object.keys(fields).length > 0) {
          const { error } = await admin
            .from(TABLE_PROFILES)
            .update(fields)
            .eq("id", body.id);
          if (error) throw error;
        }

        const { data: fresh } = await admin.auth.admin.getUserById(body.id);
        return res
          .status(200)
          .json({ user: toUser(fresh.user, await readProfile(body.id)) });
      }

      // -----------------------------------------------------------------------
      case "delete": {
        if (!body.id) return res.status(400).json({ error: "A user id is required." });
        if (body.id === caller.id) {
          return res.status(400).json({ error: "You cannot delete your own account." });
        }
        // The profile row would cascade with the account, but deleting it first
        // keeps the ordering identical to the Appwrite function it replaces.
        await admin.from(TABLE_PROFILES).delete().eq("id", body.id);
        const { error } = await admin.auth.admin.deleteUser(body.id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      // -----------------------------------------------------------------------
      default:
        return res.status(400).json({ error: `Unknown action "${body.action}".` });
    }
  } catch (e) {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    const status = Number(e?.status);
    return res
      .status(status >= 400 && status < 600 ? status : 400)
      .json({ error: e?.message ?? "The request could not be completed." });
  }
}
