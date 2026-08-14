/**
 * The plant's organisational chart, as posts rather than people.
 *
 * The shape is fixed and the names are not: a chart is a set of *posts* the
 * plant has decided exist, and who fills each one changes. So this file holds
 * the boxes and their designations, and the assignment of a staff number to a
 * post is stored separately alongside everything else the module keeps.
 *
 * That split is what makes a vacancy expressible. A post with nobody in it is
 * still a post — Plant-3's assistant plant operator on the paper chart is empty
 * and the plant still counts it — and a structure built out of the staff list
 * could not say so.
 *
 * Slot ids are stable and must not be renumbered: they are the key assignments
 * are stored against, so changing one silently empties a post.
 */

export interface ChartSlot {
  /** Stable key. Never renumber. */
  id: string;
  /** The post's designation, e.g. "Heavy Vehicle Operator". */
  title: string;
  /** Which manpower line this post counts towards. */
  counts: CountLine;
}

export interface ChartGroup {
  id: string;
  label: string;
  slots: ChartSlot[];
}

export type CountLine =
  | "manager"
  | "dispatch"
  | "supervisor"
  | "plantOperator"
  | "assistantPlantOperator"
  | "vehicleOperator"
  | "assistant";

export const COUNT_LABELS: Record<CountLine, string> = {
  manager: "Manager",
  dispatch: "Dispatch Officer",
  supervisor: "Supervisor",
  plantOperator: "Plant Operator",
  assistantPlantOperator: "Assistant Plant Operator",
  vehicleOperator: "Vehicle Operator",
  assistant: "Assistant",
};

/** The order the manpower summary reads in, top of the plant downwards. */
export const COUNT_ORDER: CountLine[] = [
  "manager",
  "dispatch",
  "supervisor",
  "plantOperator",
  "assistantPlantOperator",
  "vehicleOperator",
  "assistant",
];

const slot = (id: string, title: string, counts: CountLine): ChartSlot => ({
  id,
  title,
  counts,
});

/** Numbered copies of one post: five assistants are five separate posts. */
const repeat = (
  prefix: string,
  count: number,
  title: string,
  counts: CountLine,
): ChartSlot[] =>
  Array.from({ length: count }, (_, i) => slot(`${prefix}-${i + 1}`, title, counts));

// -----------------------------------------------------------------------------
// The chart
// -----------------------------------------------------------------------------

export const MANAGER = slot("manager", "Operation Manager", "manager");

export const SUPERVISOR_DISPATCH = slot(
  "sup-dispatch",
  "Supervisor — Dispatch & Logistics",
  "supervisor",
);

export const SUPERVISOR_PRODUCTION = slot(
  "sup-production",
  "Supervisor — Production",
  "supervisor",
);

export const DISPATCH_OFFICER = slot("dispatch-officer", "Dispatch Officer", "dispatch");

/** Under the dispatch officer. */
export const DISPATCH_GROUPS: ChartGroup[] = [
  {
    id: "logistics",
    label: "LOGISTICS",
    slots: [
      ...repeat("hv", 3, "Heavy Vehicle Operator", "vehicleOperator"),
      ...repeat("fl", 3, "Forklift Operator", "vehicleOperator"),
      slot("pickup-1", "Pickup Operator", "vehicleOperator"),
    ],
  },
  {
    id: "loading",
    label: "LOADING TEAM",
    slots: [
      slot("load-senior", "Senior Assistant", "assistant"),
      ...repeat("load", 3, "Assistant", "assistant"),
    ],
  },
];

/** Under the production supervisor. One group per packing plant. */
export const PLANT_GROUPS: ChartGroup[] = [1, 2, 3].map((n) => ({
  id: `plant-${n}`,
  label: `PLANT-${n}`,
  slots: [
    slot(`p${n}-operator`, "Plant Operator", "plantOperator"),
    slot(`p${n}-assistant-operator`, "Assistant Plant Operator", "assistantPlantOperator"),
    ...repeat(`p${n}-asst`, 4, "Assistant", "assistant"),
  ],
}));

/**
 * The jumbo filling points.
 *
 * Shown but deliberately not slots: they are manned by whichever plant team is
 * not running the 50 kg line, so counting them would double the plant's
 * headcount. See the note printed under the chart.
 */
export const JUMBO_POINTS = [1, 2, 3, 4].map((n) => ({
  id: `jumbo-${n}`,
  label: `JUMBO POINT-${n}`,
  crew: ["Operator — 1", "Assistant — 3"],
}));

/** Every post on the chart, in one list. */
export const ALL_SLOTS: ChartSlot[] = [
  MANAGER,
  SUPERVISOR_DISPATCH,
  SUPERVISOR_PRODUCTION,
  DISPATCH_OFFICER,
  ...DISPATCH_GROUPS.flatMap((g) => g.slots),
  ...PLANT_GROUPS.flatMap((g) => g.slots),
];

// -----------------------------------------------------------------------------
// The fixed footnotes.
//
// Capacity is a property of the machinery, not of who is rostered, so it cannot
// be derived from the chart and is written out as it appears on the plant's own
// copy. The note under it is the reason the two figures must never be added
// together.
// -----------------------------------------------------------------------------

export const CAPACITY = [
  { label: "50 kg bags", value: "1,500 bags / hour", note: "(all 3 plants running)" },
  { label: "Jumbo bags", value: "60 bags / hour", note: "(all 4 filling points running)" },
];

export const CAPACITY_NOTE =
  "During 50 kg plant production, jumbo production cannot be carried out. The " +
  "same staff are used for whichever line is running — either 50 kg bags or " +
  "jumbo bags — so the two capacities are not additive.";

export const JUMBO_NOTE = "Manned from the Plant-1 / 2 / 3 teams — not additional headcount.";

export const JUMBO_SUBNOTE =
  "50 kg and jumbo production cannot run at the same time; staff move to whichever line is running.";

export const CHART_FOOTER =
  "Villa Hakatha (Pvt) Ltd — Cement Packing Plant, Thilafushi";

export const CHART_TITLE = "VILLA CEMENT PLANT — ORGANIZATIONAL CHART";
