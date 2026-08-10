// =============================================================================
// Exercise api/admin-users.mjs against the live Supabase project.
//
//   npm run test:admin
//
// The route is the one piece of the app that runs on the service key, so it is
// the one place where a mistake hands somebody else's account to a caller who
// should not have it. `vite dev` does not run Vercel routes, so without this the
// only way to exercise it is by clicking through a deployed preview.
//
// It calls the exported handler directly with stubbed req/res objects. Every
// account it creates is temporary and removed at the end; the real accounts are
// never touched, and it needs none of their passwords.
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  requireEnv(
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );

const { default: handler } = await import("../api/admin-users.mjs");

const svc = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The smallest thing that looks like a Vercel response to the handler. */
function stubResponse() {
  const res = {};
  res.status = (code) => ((res.code = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

const call = async (token, body, method = "POST") => {
  const res = stubResponse();
  await handler(
    { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body },
    res,
  );
  return res;
};

const temporary = [];
const password = "harness-" + Math.random().toString(36).slice(2, 12);

/** A signed-in account of the given role, cleaned up at the end. */
async function caller(role) {
  const email = `harness-${role}-${Date.now()}@example.com`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  });
  if (error) throw error;
  temporary.push(data.user.id);
  await svc.from("profiles").insert({ id: data.user.id, name: `Harness ${role}` });

  const client = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: session, error: signInError } = await client.auth.signInWithPassword(
    { email, password },
  );
  if (signInError) throw signInError;
  return { id: data.user.id, token: session.session.access_token };
}

const results = [];
const expect = (name, res, code, alsoTrue = true) =>
  results.push({
    test: name,
    got: res.code,
    want: code,
    verdict: res.code === code && alsoTrue ? "PASS" : "*** FAIL ***",
    detail: (res.body?.error ?? "").slice(0, 46),
  });

console.log(`\nadmin-users → ${VITE_SUPABASE_URL}\n`);

try {
  const admin = await caller("admin");
  const viewer = await caller("viewer");

  // ---- the authorisation gate ----
  // Reaching the endpoint is not permission to use it, so these matter most.
  expect("no token -> 401", await call(null, { action: "list" }), 401);
  expect("non-admin -> 403", await call(viewer.token, { action: "list" }), 403);
  expect("GET -> 405", await call(admin.token, { action: "list" }, "GET"), 405);
  expect("unknown action -> 400", await call(admin.token, { action: "nope" }), 400);

  // ---- the happy path ----
  const list = await call(admin.token, { action: "list" });
  expect("list", list, 200, Array.isArray(list.body?.users));

  const email = `harness-target-${Date.now()}@example.com`;
  const created = await call(admin.token, {
    action: "create",
    email,
    password: "test-password-123",
    name: "Target",
    role: "viewer",
  });
  expect("create", created, 200, created.body?.user?.role === "viewer");
  const targetId = created.body?.user?.id;
  if (targetId) temporary.push(targetId);

  expect(
    "short password rejected",
    await call(admin.token, { action: "create", email: `x${email}`, password: "abc" }),
    400,
  );
  expect(
    "duplicate email rejected",
    await call(admin.token, { action: "create", email, password: "test-password-123" }),
    422,
  );

  const promoted = await call(admin.token, {
    action: "update",
    id: targetId,
    role: "dispatch",
  });
  expect("change role", promoted, 200, promoted.body?.user?.role === "dispatch");

  const disabled = await call(admin.token, {
    action: "update",
    id: targetId,
    active: false,
  });
  expect("disable", disabled, 200, disabled.body?.user?.active === false);

  const enabled = await call(admin.token, {
    action: "update",
    id: targetId,
    active: true,
  });
  expect("re-enable", enabled, 200, enabled.body?.user?.active === true);

  expect(
    "reset password",
    await call(admin.token, {
      action: "update",
      id: targetId,
      password: "another-password-9",
    }),
    200,
  );

  const renamed = await call(admin.token, {
    action: "update",
    id: targetId,
    displayName: "Renamed",
  });
  expect("edit profile", renamed, 200, renamed.body?.user?.displayName === "Renamed");

  // ---- guards against locking yourself out ----
  expect(
    "cannot demote self",
    await call(admin.token, { action: "update", id: admin.id, role: "viewer" }),
    400,
  );
  expect(
    "cannot disable self",
    await call(admin.token, { action: "update", id: admin.id, active: false }),
    400,
  );
  expect(
    "cannot delete self",
    await call(admin.token, { action: "delete", id: admin.id }),
    400,
  );

  expect("delete", await call(admin.token, { action: "delete", id: targetId }), 200);
  const after = await call(admin.token, { action: "list" });
  expect("deleted account is gone", after, 200, !after.body.users.some((u) => u.id === targetId));
} finally {
  // Runs even if an assertion threw: leaving harness accounts behind on a live
  // project would be worse than a failed test.
  for (const id of temporary) {
    await svc.from("profiles").delete().eq("id", id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
}

console.table(results);

const failed = results.filter((r) => r.verdict !== "PASS");
const { data: left } = await svc.auth.admin.listUsers();
console.log(
  `\ncleanup — ${left.users.length} account(s) remain: ${left.users.map((u) => u.email).join(", ")}`,
);

if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.\n`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.\n`);
