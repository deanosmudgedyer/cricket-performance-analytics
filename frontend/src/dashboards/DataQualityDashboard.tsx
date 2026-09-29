import { useEffect, useRef, useState } from "react";
import { Box, Button, Chip, Grid, Paper, Typography } from "@mui/material";
import { colors } from "../theme";
import {
  fetchDataQuality,
  uploadMatch,
  TEMPLATE_URL,
  type DataQualityReport,
  type SheetFreshness,
  type UploadResult,
} from "../api/client";

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
function AddMatchSection({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doUpload = (force: boolean) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    uploadMatch(file, force)
      .then((res) => {
        setResult(res);
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
          accept=".xlsx"
          style={{ display: "none" }}
          onChange={(e) => {
            setResult(null);
            setError(null);
            setFile(e.target.files?.[0] ?? null);
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

        <Button variant="contained" disabled={!file || uploading} onClick={() => doUpload(false)}>
          {uploading ? "Uploading…" : "3. Upload"}
        </Button>
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
                <Button size="small" variant="contained" onClick={() => doUpload(true)} disabled={uploading}>
                  Add anyway
                </Button>
                <Button size="small" onClick={reset} sx={{ ml: 1 }}>
                  Cancel
                </Button>
              </Box>
            </Paper>
          )}
        </Box>
      )}
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

  const load = () => {
    setLoading(true);
    setError(null);
    fetchDataQuality()
      .then(setReport)
      .catch(() => setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running."))
      .finally(() => setLoading(false));
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

      <AddMatchSection onUploaded={load} />

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
                </Paper>
              ))}
            </Box>
          )}
        </>
      ) : null}
    </Box>
  );
}
