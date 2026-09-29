import { FIRST_CLASS, FIFTY_OVER, T20 } from "./formatTiers";

/**
 * Where each format tier's phases split, by innings-absolute over
 * number. T20/50-Over map onto real, named phases (Powerplay/Middle/
 * Death); First Class has no such structure in real cricket, so its
 * breakpoints just mark "new ball", "well worn", "very old ball" -
 * approximate, and labelled generically (see PHASE_LABELS) rather
 * than borrowing limited-overs terminology the spec explicitly warns
 * against using for the longest format.
 */
export const PHASE_BREAKPOINTS: Record<string, number[]> = {
  [T20]: [6, 15],
  [FIFTY_OVER]: [10, 40],
  [FIRST_CLASS]: [10, 40, 80],
};

export const PHASE_LABELS: Record<string, string[]> = {
  [T20]: ["Powerplay", "Middle", "Death"],
  [FIFTY_OVER]: ["Powerplay", "Middle", "Death"],
  [FIRST_CLASS]: ["New Ball", "Early-Middle", "Middle-Late", "Old Ball"],
};

export function breakpointsForTier(tierKey: string | undefined): number[] {
  if (!tierKey) return [10, 40];
  return PHASE_BREAKPOINTS[tierKey] ?? [10, 40];
}

export function phaseLabelsForTier(tierKey: string | undefined): string[] {
  if (!tierKey) return [];
  return PHASE_LABELS[tierKey] ?? [];
}
