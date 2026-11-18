import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { askData, fetchAskDataStatus, type AskDataResult } from "../api/client";
import { colors } from "../theme";

const EXAMPLE_QUESTIONS = [
  "How many T20 matches has Thomas played?",
  "What's his economy against left-handed batsmen bowling a Good length?",
  "Which ground has he taken the most wickets at?",
];

/**
 * A plain-English question in, a read-only SQL query and its result
 * out - see backend/app/services/nl_to_sql.py's module docstring for
 * exactly how the generated query is kept from ever writing anything
 * (two independent checks: the query text itself, and the database
 * connection it runs on). The generated SQL is always shown, not
 * hidden behind a toggle - seeing exactly what ran is the whole point
 * of trusting the answer.
 */
export function AskDataDashboard() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskDataResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAskDataStatus()
      .then((status) => setAvailable(status.available))
      .catch(() => setAvailable(false));
  }, []);

  const runQuestion = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    askData(trimmed)
      .then(setResult)
      .catch((err: Error) => {
        setResult(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  return (
    <Box sx={{ flexGrow: 1, p: 4, maxWidth: 1000 }}>
      <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2 }}>
        Ask the Data
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Ask a question in plain English
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        Claude turns your question into a SQL query against the database and runs it - you always see
        the exact query that ran, right below the answer.
      </Typography>

      {available === false && (
        <Paper elevation={0} sx={{ p: 2.5, mb: 3, borderLeft: `3px solid ${colors.gold}` }}>
          <Typography variant="body2">
            This feature isn't configured on this deployment - it needs an ANTHROPIC_API_KEY set on the
            backend.
          </Typography>
        </Paper>
      )}

      <Box sx={{ display: "flex", gap: 1.5, mb: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. How many wickets has Thomas taken in T20?"
          value={question}
          disabled={available === false}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runQuestion(question);
          }}
        />
        <Button
          variant="contained"
          disabled={available === false || loading || !question.trim()}
          onClick={() => runQuestion(question)}
        >
          {loading ? "Asking…" : "Ask"}
        </Button>
      </Box>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
        {EXAMPLE_QUESTIONS.map((q) => (
          <Button
            key={q}
            size="small"
            variant="outlined"
            disabled={available === false || loading}
            onClick={() => {
              setQuestion(q);
              runQuestion(q);
            }}
          >
            {q}
          </Button>
        ))}
      </Box>

      {error && (
        <Paper elevation={0} sx={{ p: 2, mb: 3, borderLeft: `3px solid ${colors.clayRed}` }}>
          <Typography variant="body2" sx={{ color: colors.clayRed }}>
            {error}
          </Typography>
        </Paper>
      )}

      {result && (
        <Box>
          <Paper elevation={0} sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {result.explanation}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: colors.surfaceAlt }}>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
              SQL that ran
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{ fontFamily: "monospace", whiteSpace: "pre-wrap", m: 0 }}
            >
              {result.sql}
            </Typography>
          </Paper>

          {result.rows.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No rows returned.
            </Typography>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {result.columns.map((col) => (
                      <TableCell key={col} sx={{ color: "text.secondary" }}>
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.rows.map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((col) => (
                        <TableCell key={col}>{String(row[col] ?? "—")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {result.truncated && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
                  Showing the first {result.row_count} rows - the query matched more than that.
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
