import { useEffect, useRef, useState } from "react";
import { Box, Button, Chip, Grid, MenuItem, Paper, Select, Typography } from "@mui/material";
import { colors } from "../theme";
import {
  assignBowlerType,
  fetchDataQuality,
  fetchHealth,
  fetchUnassignedBowlers,
  fixDataQualityIssue,
  uploadMatch,
  BOWLER_TYPES,
  TEMPLATE_URL,
  type CategoryCorrection,
  type DataQualityReport,
  type SheetFreshness,
  type UnassignedBowler,
  type UploadResult,
} from "../api/client";

// Per new_categories item (by array index), the user's one-by-one
// decision: keep the flagged value as a deliberate new addition, or
// replace it with one of the column's existing values (a typo fix).
type CategoryDecision = { action: "new" } | { action: "replace"; replacement: string };

const SEVERITY_COLOR: Record<string, string> = {
  warning: colors.clayRed,
  info: colors.gold,
};

function FreshnessCard({ title, freshness }: { title: string; freshness: SheetFreshness }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderBottom: `3px solid ${freshness.stale ? colors.clayRed : colors.turfGreen}`,
      }}
    >
      <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1.5 }}>
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {freshness.stale ? "⚠ Stale" : "✓ Up to date"}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {freshness.raw_rows} row(s) in the source spreadsheet, {freshness.db_rows} in the database
      </Typography>
      {freshness.stale && (
        <Typography variant="body2" sx={{ color: colors.clayRed, mt: 1 }}>
          The spreadsheet has changed since the last ingestion run - every stat in the app is
          currently showing the OLD data. Run <code>python -m app.ingestion.load_spreadsheet</code> to
          refresh it.
        </Typography>
      )}
    </Paper>
  );
}

/**
 * "Add a Match" - the download-template / fill-it-in / upload-it
 * workflow, replacing the old terminal-only path (hand-edit the
 * master spreadsheet, run the ingestion script yourself). See
 * app/services/template.py and app/ingestion/upload.py for the
 * backend half of this.
 */
// canonical column name (as stored/compared on the backend) -> a label
// a person filling in the template would recognise.
const CATEGORY_COLUMN_LABELS: Record<string, string> = {
  ground: "Ground",
  opposition: "Opposition",
  team: "Team",
  competition: "Competition",
  bowling_end: "End",
  area_scored: "Area Scored",
  shot: "Shot",
};

function AddMatchSection({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two independent confirmations can gate a merge (a likely-duplicate
  // match, and/or a value in a "suggestion" column - see api/client.ts).
  // Once the user has cleared one, that confirmation needs to stick
  // across the next resubmit even if it's the OTHER gate they're now
  // clearing - hence tracking both here rather than as one-shot args.
  const [forceConfirmed, setForceConfirmed] = useState(false);
  // One decision per new_categories item, keyed by its index in the
  // array the backend returned - stable for as long as `result` itself
  // doesn't change (i.e. until the next upload/reset).
  const [categoryDecisions, setCategoryDecisions] = useState<Record<number, CategoryDecision>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doUpload = (force: boolean, confirmNewCategories: boolean, corrections: CategoryCorrection[] = []) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    uploadMatch(file, force, confirmNewCategories, corrections)
      .then((res) => {
        setResult(res);
        setCategoryDecisions({});
        if (res.status === "success") {
          onUploaded();
        }
      })
      .catch(() => setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running."))
      .finally(() => setUploading(false));
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setForceConfirmed(false);
    setCategoryDecisions({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Paper elevation={0} sx={{ p: 3, mb: 4, border: `1px solid ${colors.gold}` }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Add a Match
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        Download the template, fill in one row per delivery for the new match, then upload it here.
        It gets checked for obvious problems, then merged into the existing data - nothing already in
        the app is ever overwritten.
      </Typography>

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <Button
          variant="outlined"
          component="a"
          href={TEMPLATE_URL}
          sx={{ borderColor: colors.turfGreen, color: colors.turfGreen }}
        >
          1. Download Template
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          // Both the extension AND the two real-world MIME types Excel
          // actually sends for .xlsx (the modern one, and the generic
          // one some Windows/Excel/OneDrive combinations send instead)
          // - accepting only ".xlsx" can make a browser's native file
          // picker grey out or hide a valid file if it reports a
          // slightly different type than expected.
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream"
          style={{ display: "none" }}
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setResult(null);
            setForceConfirmed(false);
            setCategoryDecisions({});
            if (chosen && !chosen.name.toLowerCase().endsWith(".xlsx")) {
              setError(`"${chosen.name}" doesn't look like an .xlsx file - save the template as Excel Workbook (.xlsx) and try again.`);
              setFile(null);
              return;
            }
            setError(null);
            setFile(chosen);
          }}
        />
        <Button variant="outlined" onClick={() => fileInputRef.current?.click()} sx={{ borderColor: colors.gold, color: colors.gold }}>
          2. Choose Filled-In File
        </Button>
        {file && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {file.name}
          </Typography>
        )}

        <Box>
          <Button
            variant="contained"
            disabled={!file || uploading}
            onClick={() => doUpload(forceConfirmed, false)}
          >
            {uploading ? "Uploading…" : "3. Upload"}
          </Button>
          {!file && !uploading && (
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
              Choose a filled-in file above first.
            </Typography>
          )}
        </Box>
      </Box>

      {error && (
        <Typography variant="body2" sx={{ color: colors.clayRed, mb: 1 }}>
          {error}
        </Typography>
      )}

      {result && (
        <Box sx={{ mt: 1 }}>
          {result.status === "success" && (
            <Paper elevation={0} sx={{ p: 2, borderLeft: `3px solid ${colors.turfGreen}`, bgcolor: colors.surfaceAlt }}>
              <Typography variant="body2" sx={{ color: "text.primary" }}>
                ✓ {result.message}
              </Typography>
              <Button size="small" onClick={reset} sx={{ mt: 1, color: colors.turfGreen }}>
                Add another match
              </Button>
            </Paper>
          )}

          {result.status === "empty" && (
            <Paper elevation={0} sx={{ p: 2, borderLeft: `3px solid ${colors.gold}`, bgcolor: colors.surfaceAlt }}>
              <Typography variant="body2" sx={{ color: "text.primary" }}>
                {result.message}
              </Typography>
            </Paper>
          )}

          {result.status === "error" && (
            <Paper elevation={0} sx={{ p: 2, borderLeft: `3px solid ${colors.clayRed}`, bgcolor: colors.surfaceAlt }}>
              <Typography variant="body2" sx={{ color: "text.primary", mb: 1 }}>
                {result.message}
              </Typography>
              {result.issues.map((issue, i) => (
                <Typography key={i} variant="body2" sx={{ color: colors.clayRed }}>
                  • {issue.message}
                </Typography>
              ))}
            </Paper>
          )}

          {result.status === "duplicate" && (
            <Paper elevation={0} sx={{ p: 2, borderLeft: `3px solid ${colors.gold}`, bgcolor: colors.surfaceAlt }}>
              <Typography variant="body2" sx={{ color: "text.primary", mb: 1 }}>
                {result.message}
              </Typography>
              {result.duplicate_matches.map((m, i) => (
                <Chip
                  key={i}
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                  label={`${m.date} · ${m.competition} · ${m.team} vs ${m.opposition} · ${m.ground}`}
                />
              ))}
              <Box sx={{ mt: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={uploading}
                  onClick={() => {
                    setForceConfirmed(true);
                    doUpload(true, false);
                  }}
                >
                  Add anyway
                </Button>
                <Button size="small" onClick={reset} sx={{ ml: 1 }}>
                  Cancel
                </Button>
              </Box>
            </Paper>
          )}

          {result.status === "new_categories" && (
            <Paper elevation={0} sx={{ p: 2, borderLeft: `3px solid ${colors.gold}`, bgcolor: colors.surfaceAlt }}>
              <Typography variant="body2" sx={{ color: "text.primary", mb: 1.5 }}>
                {result.message}
              </Typography>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
                {result.new_categories.map((c, i) => {
                  const decision = categoryDecisions[i];
                  const label = `${CATEGORY_COLUMN_LABELS[c.column] ?? c.column} (${c.sheet})`;
                  return (
                    <Box
                      key={i}
                      sx={{
                        p: 1.5,
                        border: `1px solid ${decision ? colors.turfGreen : colors.border}`,
                        borderRadius: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography variant="body2" sx={{ minWidth: 220 }}>
                        {label}: <strong>"{c.value}"</strong>
                      </Typography>

                      <Button
                        size="small"
                        variant={decision?.action === "new" ? "contained" : "outlined"}
                        onClick={() => setCategoryDecisions((d) => ({ ...d, [i]: { action: "new" } }))}
                      >
                        ✓ Yes, new
                      </Button>

                      {c.existing_values.length > 0 && (
                        <>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            or it should be:
                          </Typography>
                          <Select
                            size="small"
                            displayEmpty
                            value={decision?.action === "replace" ? decision.replacement : ""}
                            onChange={(e) =>
                              setCategoryDecisions((d) => ({
                                ...d,
                                [i]: { action: "replace", replacement: e.target.value },
                              }))
                            }
                            sx={{ minWidth: 170 }}
                          >
                            <MenuItem value="" disabled>
                              Choose the correct value…
                            </MenuItem>
                            {c.existing_values.map((v) => (
                              <MenuItem key={v} value={v}>
                                {v}
                              </MenuItem>
                            ))}
                          </Select>
                        </>
                      )}

                      {decision?.action === "replace" && (
                        <Typography variant="caption" sx={{ color: colors.turfGreen }}>
                          Will replace every "{c.value}" with "{decision.replacement}".
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>

              <Button
                size="small"
                variant="contained"
                disabled={
                  uploading ||
                  result.new_categories.some((_, i) => {
                    const d = categoryDecisions[i];
                    return !d || (d.action === "replace" && !d.replacement);
                  })
                }
                onClick={() => {
                  const corrections: CategoryCorrection[] = result.new_categories
                    .map((c, i) => ({ c, decision: categoryDecisions[i] }))
                    .filter(({ decision }) => decision?.action === "replace")
                    .map(({ c, decision }) => ({
                      sheet: c.sheet,
                      column: c.column,
                      from: c.value,
                      to: (decision as { action: "replace"; replacement: string }).replacement,
                    }));
                  doUpload(forceConfirmed, true, corrections);
                }}
              >
                Continue
              </Button>
              <Button size="small" onClick={reset} sx={{ ml: 1 }}>
                Cancel
              </Button>
            </Paper>
          )}
        </Box>
      )}
    </Paper>
  );
}

/**
 * Classifying a bowler is a one-time decision that applies to every
 * ball they've bowled (and every future upload that names them) at
 * once - a durable, reusable tool rather than a one-off backfill
 * script, since a new opposition bowler shows up in nearly every new
 * match (see app/ingestion/corrections.py's assign_bowler_type).
 */
function AssignBowlerTypesSection({ onAssigned }: { onAssigned: () => void }) {
  const [bowlers, setBowlers] = useState<UnassignedBowler[] | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetchUnassignedBowlers()
      .then(setBowlers)
      .catch(() => setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running."));
  };

  useEffect(load, []);

  const assign = (bowler: string) => {
    const bowlerType = selections[bowler];
    if (!bowlerType) return;
    setAssigning(bowler);
    setError(null);
    assignBowlerType(bowler, bowlerType)
      .then(() => {
        load();
        onAssigned();
      })
      .catch(() => setError("Couldn't assign that bowler type. Make sure `uvicorn app.main:app --reload` is running."))
      .finally(() => setAssigning(null));
  };

  if (bowlers === null || bowlers.length === 0) return null;

  return (
    <Paper elevation={0} sx={{ p: 3, mb: 4, border: `1px solid ${colors.gold}` }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Assign Bowler Types
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {bowlers.length} opposition bowler{bowlers.length === 1 ? "" : "s"} {bowlers.length === 1 ? "has" : "have"} no
        Bowler Type yet. Classifying one applies to every ball they've bowled at once.
      </Typography>

      {error && (
        <Typography variant="body2" sx={{ color: colors.clayRed, mb: 1.5 }}>
          {error}
        </Typography>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {bowlers.map((b) => (
          <Box
            key={b.bowler}
            sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}
          >
            <Typography variant="body2" sx={{ minWidth: 160 }}>
              {b.bowler} <span style={{ color: colors.chalkMuted }}>({b.balls} ball{b.balls === 1 ? "" : "s"})</span>
            </Typography>
            <Select
              size="small"
              displayEmpty
              value={selections[b.bowler] ?? ""}
              onChange={(e) => setSelections((s) => ({ ...s, [b.bowler]: e.target.value }))}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="" disabled>
                Choose a bowler type…
              </MenuItem>
              {BOWLER_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </Select>
            <Button
              size="small"
              variant="contained"
              disabled={!selections[b.bowler] || assigning === b.bowler}
              onClick={() => assign(b.bowler)}
            >
              {assigning === b.bowler ? "Assigning…" : "Assign"}
            </Button>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/**
 * Surfaces app/ingestion/validation.py's checks and a raw-vs-database
 * row-count freshness check, both previously console-only output from
 * running the ingestion script by hand. Lives at the top level (not
 * inside a format tier) since it's a whole-workbook concern - a data
 * problem in one match's rows matters regardless of which tier you'd
 * otherwise be looking at.
 */
export function DataQualityDashboard() {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The chosen replacement value per issue (keyed by its index in
  // report.issues), and which issue (if any) is currently being
  // applied - both reset on every reload since a fresh report means a
  // fresh set of issue indices.
  const [fixSelections, setFixSelections] = useState<Record<number, string>>({});
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  // True only on the public read-only deployment - hides the upload/
  // fix controls instead of showing them only for the backend to
  // reject every attempt (see main.py's READ_ONLY env var).
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then((h) => setReadOnly(h.read_only))
      .catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    setFixSelections({});
    fetchDataQuality()
      .then(setReport)
      .catch(() => setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running."))
      .finally(() => setLoading(false));
  };

  const applyFix = (index: number, issue: DataQualityReport["issues"][number]) => {
    const toValue = fixSelections[index];
    if (!issue.column || !issue.variants || !toValue) return;
    setApplyingIndex(index);
    setError(null);
    fixDataQualityIssue(issue.sheet, issue.column, issue.variants, toValue)
      .then(load)
      .catch(() => setError("Couldn't apply the fix. Make sure `uvicorn app.main:app --reload` is running."))
      .finally(() => setApplyingIndex(null));
  };

  useEffect(load, []);

  return (
    <Box sx={{ flexGrow: 1, p: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
        <Box>
          <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2 }}>
            Data
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 600 }}>
            Manage Match Data
          </Typography>
        </Box>
        <Button variant="outlined" onClick={load} disabled={loading} sx={{ borderColor: colors.gold, color: colors.gold }}>
          Re-check
        </Button>
      </Box>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3, maxWidth: 700 }}>
        The data-quality checks below read the raw workbook fresh every time this page loads - not
        the database - so they reflect the current spreadsheet on disk, including edits made since
        the last ingestion run.
      </Typography>

      {readOnly ? (
        <Paper elevation={0} sx={{ p: 3, mb: 4, border: `1px solid ${colors.border}` }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Add a Match
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            This is a read-only public demo, so uploading matches and fixing data issues are
            disabled here. Clone the repo to run it locally with full write access.
          </Typography>
        </Paper>
      ) : (
        <>
          <AddMatchSection onUploaded={load} />
          <AssignBowlerTypesSection onAssigned={load} />
        </>
      )}

      {error && (
        <Typography variant="body2" sx={{ color: colors.clayRed, mb: 2 }}>
          {error}
        </Typography>
      )}

      {loading && !report ? (
        <Typography variant="body2" color="text.secondary">
          Checking…
        </Typography>
      ) : report ? (
        <>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FreshnessCard title="Bowling Sheet" freshness={report.bowling} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FreshnessCard title="Batting Sheet" freshness={report.batting} />
            </Grid>
          </Grid>

          <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mb: 2 }}>
            Validation Issues
          </Typography>
          {report.issues.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No data-quality issues found.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {report.issues.map((issue, index) => (
                <Paper
                  key={index}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity] ?? colors.gold}`,
                    bgcolor: colors.surfaceAlt,
                  }}
                >
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
                    {issue.severity.toUpperCase()} · {issue.sheet}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.primary", lineHeight: 1.6 }}>
                    {issue.message}
                  </Typography>

                  {!readOnly && issue.column && issue.options && issue.variants && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mt: 1.5 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Fix it - the correct value is:
                      </Typography>
                      <Select
                        size="small"
                        displayEmpty
                        value={fixSelections[index] ?? ""}
                        onChange={(e) => setFixSelections((s) => ({ ...s, [index]: e.target.value }))}
                        sx={{ minWidth: 170 }}
                      >
                        <MenuItem value="" disabled>
                          Choose the correct value…
                        </MenuItem>
                        {issue.options.map((v) => (
                          <MenuItem key={v} value={v}>
                            {v}
                          </MenuItem>
                        ))}
                      </Select>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!fixSelections[index] || applyingIndex === index}
                        onClick={() => applyFix(index, issue)}
                      >
                        {applyingIndex === index ? "Applying…" : "Apply fix"}
                      </Button>
                    </Box>
                  )}
                </Paper>
              ))}
            </Box>
          )}
        </>
      ) : null}
    </Box>
  );
}
