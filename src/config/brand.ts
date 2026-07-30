/**
 * Application and organisation identity.
 *
 * These were previously editable under Settings → Company / PDF & Report
 * Branding. They are fixed values now: this is a single-plant, single-tenant
 * application, so making them configurable only created a way for the name on a
 * printed report to drift away from the plant it belongs to. Changing any of
 * them is a code change, deliberately.
 */

/** Short product name, used in the sidebar, login card and page titles. */
export const APP_NAME = "CPSM";

/** Expanded product name shown beside the logo. */
export const APP_LONG_NAME = "Cement Plant Stock Management";

/** The organisation the plant belongs to. */
export const ORG_NAME = "Thilafushi Industrial Complex";

/** Title printed at the head of the stock report and its PDF. */
export const REPORT_TITLE = "CEMENT STOCK";

/** Footer line printed on every page of the PDF. */
export const PDF_FOOTER = `Confidential — ${ORG_NAME}`;

/** MT equivalent of one 50KG bag, used for tonnage conversions. */
export const BAG_WEIGHT_MT = 0.05;
