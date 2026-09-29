import type {
  BattingBreakdownRow,
  BattingDelivery,
  BattingOverRow,
  BattingStats,
  BowlingBreakdownRow,
  BowlingDelivery,
  BowlingOverRow,
  BowlingStats,
  DeliveryFilters,
  FilterOptions,
  MatchSummary,
} from "../types/cricket";

// Relative paths - in local development, Vite's dev server proxies
// "/api" to FastAPI (see vite.config.ts for the current port - not
// FastAPI's usual 8000, see that file's comment for why). Once the
// frontend is built and served BY FastAPI (see backend/app/main.py),
// these same relative paths resolve to the same origin automatically.
const API_BASE_URL = "";

/** Turns a DeliveryFilters object into URL query parameters, repeating
 * the key for array values (e.g. length=Good&length=Full) - the
 * format FastAPI's request.query_params.getlist() expects. */
function buildQueryString(filters: DeliveryFilters): string {
  const params = new URLSearchParams();

  for (const [column, values] of Object.entries(filters.equals)) {
    values.forEach((value) => params.append(column, value));
  }
  if (filters.over_min !== undefined) params.append("over_min", String(filters.over_min));
  if (filters.over_max !== undefined) params.append("over_max", String(filters.over_max));
  filters.over?.forEach((over) => params.append("over", String(over)));
  if (filters.date_from) params.append("date_from", filters.date_from);
  if (filters.date_to) params.append("date_to", filters.date_to);

  return params.toString();
}

/** Builds "?group_by=a&group_by=b" - a single dimension for a plain
 * breakdown, several for a combination (see the backend's
 * bowling_breakdown docstring: a combination is just a breakdown with
 * more than one group_by value). */
function groupByQuery(groupBy: string | string[]): string {
  const values = Array.isArray(groupBy) ? groupBy : [groupBy];
  return values.map((v) => `group_by=${encodeURIComponent(v)}`).join("&");
}

async function getJson<T>(path: string, filters?: DeliveryFilters): Promise<T> {
  const query = filters ? buildQueryString(filters) : "";
  // `path` sometimes already carries its own query string (e.g. the
  // breakdown endpoints' "?group_by=length") - joining with a second
  // "?" instead of "&" silently produced a malformed URL FastAPI
  // couldn't parse (?group_by=length?match_id=527), so every
  // breakdown/comparison chart broke the moment any filter was active.
  const separator = path.includes("?") ? "&" : "?";
  const url = `${API_BASE_URL}${path}${query ? `${separator}${query}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface ValidationIssue {
  sheet: string;
  severity: "warning" | "info";
  message: string;
}

export interface SheetFreshness {
  raw_rows: number;
  db_rows: number;
  stale: boolean;
}

export interface DataQualityReport {
  issues: ValidationIssue[];
  bowling: SheetFreshness;
  batting: SheetFreshness;
}

export function fetchDataQuality(): Promise<DataQualityReport> {
  return getJson<DataQualityReport>("/api/data-quality");
}

export const TEMPLATE_URL = "/api/template";

export interface UploadIssue {
  sheet: string;
  severity: "warning" | "info";
  message: string;
  blocking: boolean;
}

export interface DuplicateMatch {
  date: string;
  competition: string;
  team: string;
  opposition: string;
  ground: string;
}

export interface UploadResult {
  status: "success" | "duplicate" | "empty" | "error";
  message: string;
  bowling_rows_added: number;
  batting_rows_added: number;
  issues: UploadIssue[];
  duplicate_matches: DuplicateMatch[];
}

export async function uploadMatch(file: File, force = false): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/upload-match?force=${force}`, { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }
  return response.json() as Promise<UploadResult>;
}

export interface Insight {
  text: string;
  tone: "good" | "bad" | "neutral";
  category: string;
}

// ------------------------------------------------------------ Bowling

export interface BowlingInningsSummary extends BowlingStats {
  [key: string]: unknown;
  bowling_innings_id: number;
  match_id: number;
  match_date: string;
  competition: string;
  opposition: string;
  ground: string;
  innings_label: string;
  maidens: number | null;
}

export interface BattingInningsRow {
  batting_innings_id: number;
  match_id: number;
  match_date: string;
  competition: string;
  opposition: string;
  ground: string;
  innings_label: string;
  batting_position: number;
  runs: number;
  balls_faced: number;
  is_out: boolean;
  fifty: boolean;
  hundred: boolean;
}

export interface StrengthWeaknessFinding {
  dimension: string;
  value: string | number;
  kind: "strength" | "weakness";
  reasons: ("scoring_rate" | "dismissal_concentration")[];
  balls_faced: number;
  runs: number;
  strike_rate: number | null;
  average: number | null;
  dismissals: number;
  dot_ball_pct: number | null;
  boundary_pct: number | null;
  small_sample: boolean;
}

export interface StrengthsWeaknesses {
  overall: BattingStats;
  strengths: StrengthWeaknessFinding[];
  weaknesses: StrengthWeaknessFinding[];
}

export interface InningsBreakdownRow {
  [dimension: string]: unknown;
  innings: number;
  runs: number;
  balls_faced: number;
  average: number | null;
  strike_rate: number | null;
  highest_score: number;
  not_outs: number;
  fifties: number;
  hundreds: number;
  dismissals: number;
}

export interface BattingCareerSummary {
  innings: BattingInningsRow[];
  career: {
    innings_played: number;
    highest_score: number | null;
    not_outs: number;
    fifties: number;
    hundreds: number;
  };
}

export interface PhaseBreakdown {
  phases: Record<string, unknown>[];
  note: string | null;
}

function phaseQuery(breakpoints: number[]): string {
  return breakpoints.map((b) => `breakpoint=${b}`).join("&");
}

export const bowlingApi = {
  filterOptions: () => getJson<FilterOptions>("/api/bowling/filter-options"),
  matches: (filters?: DeliveryFilters) => getJson<MatchSummary[]>("/api/bowling/matches", filters),
  inningsSummary: (filters?: DeliveryFilters) =>
    getJson<BowlingInningsSummary[]>("/api/bowling/innings-summary", filters),
  stats: (filters: DeliveryFilters) => getJson<BowlingStats>("/api/bowling/stats", filters),
  breakdown: (groupBy: string | string[], filters: DeliveryFilters) =>
    getJson<BowlingBreakdownRow[]>(`/api/bowling/breakdown?${groupByQuery(groupBy)}`, filters),
  insights: (filters: DeliveryFilters) => getJson<Insight[]>("/api/bowling/insights", filters),
  deliveries: (filters: DeliveryFilters) => getJson<BowlingDelivery[]>("/api/bowling/deliveries", filters),
  wickets: (filters: DeliveryFilters) => getJson<BowlingDelivery[]>("/api/bowling/wickets", filters),
  byOver: (filters: DeliveryFilters) => getJson<BowlingOverRow[]>("/api/bowling/by-over", filters),
  phaseBreakdown: (breakpoints: number[], filters: DeliveryFilters) =>
    getJson<PhaseBreakdown>(`/api/bowling/phase-breakdown?${phaseQuery(breakpoints)}`, filters),
};

// ------------------------------------------------------------ Batting

export const battingApi = {
  filterOptions: () => getJson<FilterOptions>("/api/batting/filter-options"),
  matches: (filters?: DeliveryFilters) => getJson<MatchSummary[]>("/api/batting/matches", filters),
  inningsSummary: (filters?: DeliveryFilters) =>
    getJson<BattingCareerSummary>("/api/batting/innings-summary", filters),
  stats: (filters: DeliveryFilters) => getJson<BattingStats>("/api/batting/stats", filters),
  breakdown: (groupBy: string | string[], filters: DeliveryFilters) =>
    getJson<BattingBreakdownRow[]>(`/api/batting/breakdown?${groupByQuery(groupBy)}`, filters),
  insights: (filters: DeliveryFilters) => getJson<Insight[]>("/api/batting/insights", filters),
  deliveries: (filters: DeliveryFilters) => getJson<BattingDelivery[]>("/api/batting/deliveries", filters),
  dismissals: (filters: DeliveryFilters) => getJson<BattingDelivery[]>("/api/batting/dismissals", filters),
  strengthsWeaknesses: (filters: DeliveryFilters) =>
    getJson<StrengthsWeaknesses>("/api/batting/strengths-weaknesses", filters),
  inningsBreakdown: (by: string, filters?: DeliveryFilters) =>
    getJson<InningsBreakdownRow[]>(`/api/batting/innings-breakdown?by=${encodeURIComponent(by)}`, filters),
  byOver: (filters: DeliveryFilters) => getJson<BattingOverRow[]>("/api/batting/by-over", filters),
  phaseBreakdown: (breakpoints: number[], filters: DeliveryFilters) =>
    getJson<PhaseBreakdown>(`/api/batting/phase-breakdown?${phaseQuery(breakpoints)}`, filters),
};
