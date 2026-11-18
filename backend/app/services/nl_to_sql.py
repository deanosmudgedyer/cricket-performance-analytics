"""
Turns a plain-English question into a read-only SQL query against the
cricket database, using Claude - the other AI-shaped feature in this
app (see app/ml/ for the trained prediction model) is a single LLM
call, not a training job.

Security model: the LLM only ever PROPOSES a query - this module
never trusts it. Every generated query is validated as a single,
read-only SELECT before it touches the database (_validate_select_only),
AND the connection it runs on is opened in SQLite's own read-only mode
(?mode=ro) as a second, independent layer that would still block a
write even if the validation step had a bug. That's the same stance
app/ingestion/upload.py already takes toward an uploaded spreadsheet:
untrusted input gets validated, not trusted because it "should" be
fine.

Model choice: claude-opus-5-5. This is a genuinely lightweight task
(one schema-grounded SQL query per question) that a cheaper model
could very likely handle - if cost per question matters for this
project, Sonnet or Haiku are reasonable to try; swapping MODEL below
is the entire change needed.
"""
import re
import sqlite3
from pathlib import Path

from anthropic import Anthropic
from pydantic import BaseModel

from app.db.database import DB_PATH

MODEL = "claude-opus-5-5"
MAX_QUESTION_LENGTH = 500
MAX_ROWS = 200

_SCHEMA_PATH = Path(__file__).resolve().parents[1] / "db" / "schema.sql"
_SCHEMA_START_MARKER = "CREATE TABLE IF NOT EXISTS matches"

# Checked against the WHOLE query (including inside a WITH clause or
# subquery), not just its first word - defense in depth alongside the
# read-only connection in run_readonly_query. Blocks SQLite's own
# write/schema/pragma vocabulary, not just the common SQL DML verbs.
_BLOCKED_KEYWORDS = (
    "insert", "update", "delete", "drop", "alter", "create", "attach",
    "detach", "pragma", "vacuum", "reindex", "replace", "truncate",
)


class SqlQueryResult(BaseModel):
    sql: str
    explanation: str


class SqlAssistantError(Exception):
    """A question that can't be safely turned into a query - bad
    input, a generated query that failed validation, or an
    unconfigured API key. Always a 4xx-shaped problem for the
    endpoint built on this module, never a crash."""


def _load_schema_context() -> str:
    text = _SCHEMA_PATH.read_text(encoding="utf-8")
    start = text.index(_SCHEMA_START_MARKER)
    # The real schema.sql, including its own comments explaining the
    # business rules (is_legal_delivery, counts_for_economy, etc.) -
    # read fresh every call rather than duplicated into a hand-written
    # description that could drift from the actual columns.
    return text[start:]


def _system_prompt() -> str:
    return (
        "You are a SQLite query generator for a personal cricket analytics database "
        "that tracks exactly one player, Thomas Mayes, across both disciplines he plays - "
        "bowling and batting. Given a plain-English question, write ONE read-only SQL "
        "query that answers it, using SQLite syntax only.\n\n"
        "Rules:\n"
        "- SELECT (or WITH ... SELECT) only - never write, alter, or modify data, "
        "and never more than one statement.\n"
        "- Use only the tables and columns in the schema below - never invent one.\n"
        "- Join to `matches` whenever the question mentions a format, opposition, "
        "ground, team, or date - those columns live on `matches`, not on either "
        "deliveries table.\n"
        "- `bowling_deliveries` is every ball THOMAS BOWLED (its `batsman` column is "
        "the opponent he bowled to). `batting_deliveries` is every ball THOMAS FACED "
        "(its `bowler` column is the opponent who bowled to him). Pick whichever "
        "table matches what the question is actually asking about Thomas.\n"
        "- For an economy/run-rate question, exclude extras per the schema's own "
        "counts_for_economy / counts_for_batsman_runs columns, not every `runs_off_bat`/"
        "`runs_scored` value.\n"
        "- If the question is ambiguous, unanswerable from this schema, or would "
        "require a second statement, say so plainly in `explanation` and return "
        "your best single-query attempt anyway.\n\n"
        f"Schema:\n```sql\n{_load_schema_context()}\n```"
    )


def _validate_select_only(sql: str) -> None:
    stripped = sql.strip()
    if not stripped:
        raise SqlAssistantError("The model returned an empty query.")
    body = stripped[:-1].strip() if stripped.endswith(";") else stripped
    if ";" in body:
        raise SqlAssistantError("Only a single SQL statement is allowed.")
    first_word = body.split(None, 1)[0].lower() if body else ""
    if first_word not in ("select", "with"):
        raise SqlAssistantError("Only a SELECT (or WITH ... SELECT) query is allowed.")
    lowered = body.lower()
    for keyword in _BLOCKED_KEYWORDS:
        if re.search(rf"\b{keyword}\b", lowered):
            raise SqlAssistantError(f"Query contains a disallowed keyword: '{keyword}'.")


def generate_sql(question: str, client: Anthropic) -> SqlQueryResult:
    question = question.strip()
    if not question:
        raise SqlAssistantError("Ask a question first.")
    if len(question) > MAX_QUESTION_LENGTH:
        raise SqlAssistantError(f"Question is too long (max {MAX_QUESTION_LENGTH} characters).")

    response = client.messages.parse(
        model=MODEL,
        max_tokens=2048,
        system=_system_prompt(),
        messages=[{"role": "user", "content": question}],
        output_format=SqlQueryResult,
    )
    result = response.parsed_output
    if result is None:
        # response.parsed_output is typed Optional - structured output
        # is supposed to guarantee this is always populated, but a
        # refusal or an unusual stop reason could still leave it
        # empty. Treat that as "couldn't answer this one", not a 500.
        raise SqlAssistantError(
            f"Couldn't generate a query for that question (stop_reason: {response.stop_reason})."
        )
    _validate_select_only(result.sql)
    return result


def run_readonly_query(sql: str, limit: int = MAX_ROWS) -> tuple[list[str], list[dict], bool]:
    """Executes an already-validated SELECT on a connection opened in
    SQLite's own read-only mode (?mode=ro) - a write attempt fails at
    the database layer itself, independent of _validate_select_only
    above. Returns (columns, rows, truncated)."""
    uri = f"file:{DB_PATH.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute(sql)
        columns = [d[0] for d in cursor.description] if cursor.description else []
        fetched = cursor.fetchmany(limit + 1)
    except sqlite3.Error as exc:
        raise SqlAssistantError(f"The database rejected this query: {exc}") from exc
    finally:
        conn.close()

    truncated = len(fetched) > limit
    rows = [dict(row) for row in fetched[:limit]]
    return columns, rows, truncated


def ask(question: str, client: Anthropic) -> dict:
    result = generate_sql(question, client)
    columns, rows, truncated = run_readonly_query(result.sql)
    return {
        "sql": result.sql,
        "explanation": result.explanation,
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "truncated": truncated,
    }
