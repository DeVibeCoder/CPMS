import type { Repository } from "./repository";
import { LocalRepository } from "./localRepository";

/**
 * The single data access point for the whole application.
 *
 * To migrate to Supabase / a SQL backend later, implement the `Repository`
 * interface in a new file (e.g. `supabaseRepository.ts`) and change ONLY the
 * line below. Nothing else in the codebase imports a concrete repository.
 */
export const repo: Repository = new LocalRepository();

export type { Repository } from "./repository";
