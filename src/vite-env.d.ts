/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Which backend to talk to: "appwrite" (default) or "supabase".
   *
   * Temporary, for the length of the migration — it is what makes the cutover,
   * and the way back from it, a single environment variable.
   */
  readonly VITE_BACKEND?: string;

  /** Appwrite API endpoint, e.g. https://fra.cloud.appwrite.io/v1 */
  readonly VITE_APPWRITE_ENDPOINT?: string;
  /** Appwrite project id. Safe to ship — table permissions protect the data. */
  readonly VITE_APPWRITE_PROJECT_ID?: string;
  /** Database id. Defaults to "cpsm"; only set it if you renamed the database. */
  readonly VITE_APPWRITE_DATABASE_ID?: string;
  /** Id of the privileged user-management function. Defaults to "admin-users". */
  readonly VITE_APPWRITE_FUNCTION_ID?: string;

  /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable key. Safe to ship — row-level security protects the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
