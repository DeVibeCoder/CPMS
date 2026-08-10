import {
  WEATHER_BANDS,
  type Weather,
  type WeatherBand,
  type WeatherCondition,
} from "@/types";

/**
 * Weather recorded against the working day.
 *
 * One condition per band, chosen from a fixed list — the point of the section
 * is that three reports from three different clerks can be compared, which free
 * text would not allow.
 */
export const WEATHER_OPTIONS: { value: WeatherCondition; label: string }[] = [
  { value: "sunny", label: "Sunny" },
  { value: "rainy", label: "Rainy" },
  { value: "windy", label: "Windy" },
];

export function weatherLabel(condition?: WeatherCondition): string {
  return WEATHER_OPTIONS.find((o) => o.value === condition)?.label ?? "";
}

/**
 * The bands still unanswered.
 *
 * Empty means the report may be finalised. A draft may be saved with any number
 * of them outstanding — a clerk part way through the day has not got the
 * evening's weather yet, and blocking the save would lose their morning's work.
 */
export function missingWeatherBands(
  weather?: Weather,
): { key: WeatherBand; label: string }[] {
  return WEATHER_BANDS.filter((band) => !weather?.[band.key]).map((band) => ({
    key: band.key,
    label: band.label,
  }));
}

/**
 * Whether anything at all was recorded.
 *
 * Reports filed before 10 August 2026 have none, and the printed sheet leaves
 * the section out entirely for them rather than printing three empty boxes —
 * so every report already in the archive prints exactly as it always did.
 */
export function hasWeather(weather?: Weather): boolean {
  return WEATHER_BANDS.some((band) => Boolean(weather?.[band.key]));
}
