// =============================================================================
// admin-users — privileged user management.
//
// Creating an account, deleting one, changing somebody's role, enabling or
// disabling them, or resetting their password all require an API key, which
// must never reach the browser. This function is the only place that key is
// used. It re-checks on every call that the caller is a signed-in
// administrator; being able to reach the endpoint is not by itself permission
// to use it.
//
// The caller identifies itself with a short-lived JWT minted by the client SDK
// (`account.createJWT()`), passed in the request body. A JWT can only be
// produced by someone holding a valid session, so it cannot be forged the way
// a plain user-id header could.
//
// Deploy:  npx appwrite push function --function-id admin-users --force --activate true
//          (from the appwrite/ directory — see appwrite/README.md)
// =============================================================================
import {
  Account,
  Client,
  ID,
  Permission,
  Query,
  Role,
  TablesDB,
  Users,
} from "node-appwrite";

const DATABASE_ID = process.env.CPSM_DATABASE_ID || "cpsm";
const TABLE_PROFILES = "profiles";

const ROLES = ["admin", "dispatch", "viewer"];
const MIN_PASSWORD = 8;

/** The role is whichever known label the account carries. */
function roleFromLabels(labels) {
  return ROLES.find((r) => labels.includes(r)) ?? "viewer";
}

/**
 * Replace any role label while leaving unrelated labels alone, so a role change
 * never quietly drops a label some other integration put there.
 */
function withRole(labels, role) {
  return [...labels.filter((l) => !ROLES.includes(l)), role];
}

function toUser(account, row) {
  return {
    id: account.$id,
    name: row?.name ?? account.name ?? account.email.split("@")[0],
    displayName: row?.displayName ?? undefined,
    username: row?.username ?? undefined,
    email: account.email,
    role: roleFromLabels(account.labels),
    active: account.status,
    createdAt: account.registration,
    lastLogin: row?.lastLogin ?? undefined,
    avatarColor: row?.avatarColor ?? undefined,
    avatarUrl: row?.avatarUrl ?? undefined,
  };
}

/** Only the fields a profile row actually stores, with undefined dropped. */
function profileFields(body) {
  const fields = {
    name: body.name,
    displayName: body.displayName,
    username: body.username,
    avatarColor: body.avatarColor,
    avatarUrl: body.avatarUrl,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  );
}

export default async ({ req, res, error }) => {
  const endpoint =
    process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT;
  const projectId =
    process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
  // A dynamic key is injected when the function declares scopes; a static one
  // set as a function variable works on any Appwrite version.
  const apiKey = process.env.APPWRITE_API_KEY || req.headers["x-appwrite-key"];

  if (!endpoint || !projectId || !apiKey) {
    error("Missing endpoint, project id or API key in the function environment.");
    return res.json({ error: "The function is not configured correctly." }, 500);
  }

  if (req.method !== "POST") {
    return res.json({ error: "Method not allowed." }, 405);
  }

  let body;
  try {
    body = typeof req.bodyJson === "object" ? req.bodyJson : JSON.parse(req.bodyText);
  } catch {
    return res.json({ error: "Invalid JSON body." }, 400);
  }
  if (!body || typeof body !== "object") {
    return res.json({ error: "Invalid JSON body." }, 400);
  }

  // ---- Admin client: bypasses table permissions. Only used after the check. ----
  const admin = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  const users = new Users(admin);
  const tables = new TablesDB(admin);

  // ---- Authenticate and authorise the caller ----
  let caller;
  try {
    if (!body.jwt) throw new Error("missing jwt");
    const asCaller = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setJWT(body.jwt);
    caller = await new Account(asCaller).get();
  } catch {
    return res.json({ error: "Not signed in." }, 401);
  }
  if (!caller.status || roleFromLabels(caller.labels) !== "admin") {
    return res.json({ error: "Administrator access required." }, 403);
  }

  const readProfile = async (id) => {
    try {
      return await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_PROFILES,
        rowId: id,
      });
    } catch {
      return null;
    }
  };

  try {
    switch (body.action) {
      // -----------------------------------------------------------------------
      case "list": {
        const accounts = [];
        let offset = 0;
        for (;;) {
          const page = await users.list({
            queries: [Query.limit(100), Query.offset(offset)],
          });
          accounts.push(...page.users);
          if (page.users.length < 100) break;
          offset += 100;
        }

        const rows = [];
        let cursor;
        for (;;) {
          const queries = [Query.limit(100)];
          if (cursor) queries.push(Query.cursorAfter(cursor));
          const page = await tables.listRows({
            databaseId: DATABASE_ID,
            tableId: TABLE_PROFILES,
            queries,
          });
          rows.push(...page.rows);
          if (page.rows.length < 100) break;
          cursor = page.rows[page.rows.length - 1].$id;
        }
        const byId = new Map(rows.map((r) => [r.$id, r]));

        // An account with no profile row was created outside the app and cannot
        // sign in, so it is not part of the user list.
        return res.json({
          users: accounts
            .filter((a) => byId.has(a.$id))
            .map((a) => toUser(a, byId.get(a.$id)))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        });
      }

      // -----------------------------------------------------------------------
      case "create": {
        const { email, password, role = "viewer" } = body;
        if (!email || !password) {
          return res.json({ error: "Email and password are required." }, 400);
        }
        if (password.length < MIN_PASSWORD) {
          return res.json(
            { error: `Password must be at least ${MIN_PASSWORD} characters.` },
            400,
          );
        }
        if (!ROLES.includes(role)) {
          return res.json({ error: `Unknown role "${role}".` }, 400);
        }

        const name = body.name || email.split("@")[0];
        const account = await users.create({
          userId: ID.unique(),
          email,
          password,
          name,
        });

        try {
          await users.updateLabels({
            userId: account.$id,
            labels: withRole(account.labels, role),
          });
          if (body.active === false) {
            await users.updateStatus({ userId: account.$id, status: false });
          }
          // The row grants its owner read and update rights on themselves;
          // administrators reach every row through the table permissions.
          await tables.createRow({
            databaseId: DATABASE_ID,
            tableId: TABLE_PROFILES,
            rowId: account.$id,
            data: {
              name,
              displayName: body.displayName ?? null,
              username: body.username ?? email.split("@")[0],
              avatarColor: body.avatarColor ?? null,
              avatarUrl: body.avatarUrl ?? null,
              lastLogin: null,
            },
            permissions: [
              Permission.read(Role.user(account.$id)),
              Permission.update(Role.user(account.$id)),
            ],
          });
        } catch (e) {
          // Never leave an account that cannot sign in behind.
          await users.delete({ userId: account.$id }).catch(() => {});
          throw e;
        }

        const fresh = await users.get({ userId: account.$id });
        return res.json({ user: toUser(fresh, await readProfile(account.$id)) });
      }

      // -----------------------------------------------------------------------
      case "update": {
        if (!body.id) return res.json({ error: "A user id is required." }, 400);

        if (body.role !== undefined) {
          if (!ROLES.includes(body.role)) {
            return res.json({ error: `Unknown role "${body.role}".` }, 400);
          }
          if (body.id === caller.$id && body.role !== "admin") {
            return res.json(
              { error: "You cannot remove your own administrator role." },
              400,
            );
          }
          const target = await users.get({ userId: body.id });
          await users.updateLabels({
            userId: body.id,
            labels: withRole(target.labels, body.role),
          });
        }

        if (body.active !== undefined) {
          if (body.id === caller.$id && body.active === false) {
            return res.json({ error: "You cannot disable your own account." }, 400);
          }
          await users.updateStatus({ userId: body.id, status: !!body.active });
        }

        if (body.password) {
          if (body.password.length < MIN_PASSWORD) {
            return res.json(
              { error: `Password must be at least ${MIN_PASSWORD} characters.` },
              400,
            );
          }
          await users.updatePassword({ userId: body.id, password: body.password });
        }

        const fields = profileFields(body);
        if (Object.keys(fields).length > 0) {
          await tables.updateRow({
            databaseId: DATABASE_ID,
            tableId: TABLE_PROFILES,
            rowId: body.id,
            data: fields,
          });
        }

        const fresh = await users.get({ userId: body.id });
        return res.json({ user: toUser(fresh, await readProfile(body.id)) });
      }

      // -----------------------------------------------------------------------
      case "delete": {
        if (!body.id) return res.json({ error: "A user id is required." }, 400);
        if (body.id === caller.$id) {
          return res.json({ error: "You cannot delete your own account." }, 400);
        }
        await tables
          .deleteRow({
            databaseId: DATABASE_ID,
            tableId: TABLE_PROFILES,
            rowId: body.id,
          })
          .catch(() => {});
        await users.delete({ userId: body.id });
        return res.json({ ok: true });
      }

      // -----------------------------------------------------------------------
      default:
        return res.json({ error: `Unknown action "${body.action}".` }, 400);
    }
  } catch (e) {
    error(e instanceof Error ? e.stack || e.message : String(e));
    return res.json(
      { error: e?.message ?? "The request could not be completed." },
      e?.code >= 400 && e?.code < 600 ? e.code : 400,
    );
  }
};
