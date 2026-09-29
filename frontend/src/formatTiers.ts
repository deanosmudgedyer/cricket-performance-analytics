/**
 * Mirrors app/services/cricket_common.py's ALL_TIERS exactly - three
 * tiers a coach actually separates in their head, because the stats
 * that matter differ by tier (batting strike rate barely matters in a
 * Test innings, is central in T20). Never blend these on a summary
 * view - see HomeDashboard.tsx. Format is a required, explicit column
 * in the source data (see app/services/template.py), not guessed from
 * the competition name.
 */
export const FIRST_CLASS = "First Class";
export const FIFTY_OVER = "50-Over";
export const T20 = "T20";

export interface FormatTierInfo {
  key: string;
  label: string;
  description: string;
}

export const FORMAT_TIERS: FormatTierInfo[] = [
  { key: FIRST_CLASS, label: "First Class", description: "Test (international) / 3-Day / 4-Day (domestic) - two innings a side" },
  { key: FIFTY_OVER, label: "50-Over", description: "ODI (international) / List A (domestic) - one innings a side" },
  { key: T20, label: "T20", description: "T20I (international) / T20 (domestic) - one innings a side" },
];
