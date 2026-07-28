// =============================================================================
// Bootstrap the first administrator.
//
// The app only ever creates accounts through the admin-users function, which
// requires an existing admin to call it — so the very first one is created
// here, once, with an API key.
//
//   npm run appwrite:bootstrap -- admin@cementplant.com "a-good-password" "Plant Administrator"
//
// Re-running it on an existing account promotes and re-enables that account
// rather than failing, which is also how you recover a locked-out project.
// =============================================================================
import {
  Client,
  ID,
  Permission,
  Query,
  Role,
  TablesDB,
  Users,
} from "node-appwrite";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const [emailArg, passwordArg, nameArg] = process.argv.slice(2);
const email = (emailArg || "").trim().toLowerCase();
const password = passwordArg || "";
const name = nameArg || "Plant Administrator";

if (!email || !password) {
  console.error(
    "\nUsage: npm run appwrite:bootstrap -- <email> <password> [full name]\n",
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("\nThe password must be at least 8 characters.\n");
  process.exit(1);
}

const { endpoint, projectId, apiKey } = requireEnv();
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || "cpsm";

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);
const users = new Users(client);
const tables = new TablesDB(client);

const existing = await users.list({ queries: [Query.equal("email", email)] });
let account = existing.users[0];

if (account) {
  console.log(`Account ${email} already exists — promoting it.`);
  await users.updatePassword({ userId: account.$id, password });
} else {
  account = await users.create({
    userId: ID.unique(),
    email,
    password,
    name,
  });
  console.log(`Created account ${email}.`);
}

await users.updateEmailVerification({ userId: account.$id, emailVerification: true });
await users.updateStatus({ userId: account.$id, status: true });
await users.updateLabels({
  userId: account.$id,
  labels: [...account.labels.filter((l) => !["admin", "dispatch", "viewer"].includes(l)), "admin"],
});

const profile = {
  name,
  displayName: name,
  username: email.split("@")[0],
  avatarColor: null,
  avatarUrl: null,
  lastLogin: null,
};
const permissions = [
  Permission.read(Role.user(account.$id)),
  Permission.update(Role.user(account.$id)),
];

try {
  await tables.createRow({
    databaseId: DATABASE_ID,
    tableId: "profiles",
    rowId: account.$id,
    data: profile,
    permissions,
  });
  console.log("Created the profile row.");
} catch (e) {
  if (e.code !== 409) throw e;
  await tables.updateRow({
    databaseId: DATABASE_ID,
    tableId: "profiles",
    rowId: account.$id,
    data: { name, displayName: name },
    permissions,
  });
  console.log("Updated the existing profile row.");
}

console.log(`\n${email} is now an administrator. Sign in with it.\n`);
