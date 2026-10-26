import { FIRST_CLASS, FIFTY_OVER, T20 } from "./formatTiers";

/**
 * Where each format tier's phases split, by innings-absolute over
 * number. T20/50-Over map onto real, named phases (Powerplay/Middle/
 * Death); First Class has no such structure in real cricket, so its
 * breakpoints mark ball-age bands instead ("new ball", "well worn",
 * "older") - approximate, and labelled generically (see PHASE_LABELS)
 * rather than borrowing limited-overs terminology the spec explicitly
 * warns against using for the longest format.
 *
 * Only 3 First Class breakpoints/labels, not 4: a new ball is taken
 * every 80 overs under the Laws of Cricket, so "ball age" never
 * actually climbs past the 41-80 band before resetting - there's no
 * fourth "very old ball" phase in real Test/First Class cricket, just
 * the same three bands recurring. The backend bucket_by_over()
 * handles the reset itself (see its cycle_length parameter); this
 * file only needs to stop asking for a phase that doesn't exist.
 */
export const PHASE_BREAKPOINTS: Record<string, number[]> = {
  [T20]: [6, 15],
  [FIFTY_OVER]: [10, 40],
  [FIRST_CLASS]: [10, 40],
};

export const PHASE_LABELS: Record<string, string[]> = {
  [T20]: ["Powerplay", "Middle", "Death"],
  [FIFTY_OVER]: ["Powerplay", "Middle", "Death"],
  [FIRST_CLASS]: ["New Ball", "Early-Middle", "Middle-Late"],
};

export function breakpointsForTier(tierKey: string | undefined): number[] {
  if (!tierKey) return [10, 40];
  return PHASE_BREAKPOINTS[tierKey] ?? [10, 40];
}

export function phaseLabelsForTier(tierKey: string | undefined): string[] {
  if (!tierKey) return [];
  return PHASE_LABELS[tierKey] ?? [];
}
