import type { Database, User } from "@/types";

/**
 * Shapes used *only* by the localStorage implementation.
 *
 * `User` deliberately carries no password — with Appwrite Auth the password
 * never leaves the auth service. The offline store still has to keep one
 * somewhere to check logins against, so it widens the record internally and
 * strips the field again on export.
 */
export type StoredUser = User & { password: string };

export type LocalDatabase = Omit<Database, "users"> & { users: StoredUser[] };
