/** Inventory, with or without the month it was showing. */
const INVENTORY_RETURN = /^\/inventory(\?month=(all|\d{4}-(0[1-9]|1[0-2])))?$/;

/**
 * Where a report leads back to. A report opened from Inventory says so in its
 * location state; everything else, including a pasted link, belongs to Report
 * History. The state comes back out of browser history, so only a route this
 * knows is followed.
 */
export function returnPath(state: unknown): string {
  const returnTo = (state as { returnTo?: unknown } | null)?.returnTo;
  return typeof returnTo === "string" && INVENTORY_RETURN.test(returnTo)
    ? returnTo
    : "/reports";
}
