/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Appwrite API endpoint, e.g. https://fra.cloud.appwrite.io/v1 */
  readonly VITE_APPWRITE_ENDPOINT?: string;
  /** Appwrite project id. Safe to ship — table permissions protect the data. */
  readonly VITE_APPWRITE_PROJECT_ID?: string;
  /** Database id. Defaults to "cpsm"; only set it if you renamed the database. */
  readonly VITE_APPWRITE_DATABASE_ID?: string;
  /** Id of the privileged user-management function. Defaults to "admin-users". */
  readonly VITE_APPWRITE_FUNCTION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
