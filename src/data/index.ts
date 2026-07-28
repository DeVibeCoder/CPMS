import type { Repository } from "./repository";
import { LocalRepository } from "./localRepository";
import { AppwriteRepository } from "./appwriteRepository";
import { client, isAppwriteConfigured } from "@/lib/appwrite";

/**
 * The single data access point for the whole application.
 *
 * Appwrite is used whenever VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID
 * are set (see .env.example); otherwise the app falls back to the offline
 * localStorage store so it still runs for development and demos. Nothing else
 * in the codebase imports a concrete repository.
 */
export const usingAppwrite = isAppwriteConfigured && client !== null;

export const repo: Repository = usingAppwrite
  ? new AppwriteRepository(client!)
  : new LocalRepository();

if (import.meta.env.DEV) {
  console.info(
    usingAppwrite
      ? "[CPSM] Data source: Appwrite"
      : "[CPSM] Data source: localStorage (set VITE_APPWRITE_ENDPOINT to use Appwrite)",
  );
}

export type { Repository } from "./repository";
