"""
Security tests for the "Ask the Data" feature - the LLM-generated SQL
is untrusted input, exactly like an uploaded spreadsheet elsewhere in
this app, so these tests exercise _validate_select_only and the
read-only connection directly rather than mocking the Anthropic call
(which is a separate, much smaller concern - does the SDK get called
with the right arguments - not covered here).
"""
import pytest

from app.services.nl_to_sql import SqlAssistantError, _validate_select_only, run_readonly_query


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM matches",
        "select * from matches",
        "  SELECT * FROM matches  ",
        "SELECT * FROM matches;",
        "WITH recent AS (SELECT * FROM matches) SELECT * FROM recent",
    ],
)
def test_valid_select_queries_pass(sql):
    _validate_select_only(sql)  # does not raise


@pytest.mark.parametrize(
    "sql",
    [
        "",
        "   ",
        "DROP TABLE matches",
        "DELETE FROM matches",
        "UPDATE matches SET ground = 'x'",
        "INSERT INTO matches (id) VALUES (1)",
        "ALTER TABLE matches ADD COLUMN x TEXT",
        "ATTACH DATABASE 'x.db' AS x",
        "PRAGMA table_info(matches)",
        "VACUUM",
        "SELECT * FROM matches; DROP TABLE matches",
        "SELECT * FROM matches WHERE 1=1; SELECT 2",
        # A write verb hidden inside an otherwise SELECT-shaped string
        # - the keyword scan must catch this even though the query
        # starts with "select".
        "SELECT (SELECT 1 WHERE (DELETE FROM matches) IS NULL)",
    ],
)
def test_unsafe_queries_are_rejected(sql):
    with pytest.raises(SqlAssistantError):
        _validate_select_only(sql)


def test_read_only_connection_blocks_a_write_even_if_validation_is_bypassed():
    # Simulates a bug in _validate_select_only by calling the query
    # runner directly - the second, independent layer (SQLite's own
    # ?mode=ro connection) must still refuse the write.
    with pytest.raises(SqlAssistantError, match="readonly"):
        run_readonly_query("DELETE FROM matches WHERE 1=0")


def test_read_only_query_runs_and_returns_columns_and_rows():
    columns, rows, truncated = run_readonly_query("SELECT 1 AS one, 2 AS two")

    assert columns == ["one", "two"]
    assert rows == [{"one": 1, "two": 2}]
    assert truncated is False


def test_read_only_query_reports_truncation_past_the_row_limit():
    sql = "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 10) SELECT n FROM seq"

    columns, rows, truncated = run_readonly_query(sql, limit=5)

    assert len(rows) == 5
    assert truncated is True


def test_invalid_sql_raises_a_clear_error_not_a_raw_exception():
    with pytest.raises(SqlAssistantError):
        run_readonly_query("SELECT * FROM a_table_that_does_not_exist")
