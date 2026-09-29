"""
Loads deliveries from SQLite into a pandas DataFrame.

Why pandas here rather than raw SQL for every stat: at this data size
(hundreds/low-thousands of balls), loading the full table once and
slicing it in memory is simpler, faster to develop, and easy to
reason about. If/when this grows to many seasons' worth of balls,
this is the one place we'd change - swap these functions' internals
for filtered SQL queries - without touching any stats code that
depends on them.
"""
import pandas as pd

from app.db.database import get_connection


def load_bowling_deliveries() -> pd.DataFrame:
    """Every bowling delivery, joined with its innings/match context."""
    query = """
        SELECT
            d.id,
            d.bowling_innings_id,
            m.id AS match_id,
            m.date AS match_date,
            m.competition,
            m.format_tier,
            m.team,
            m.opposition,
            m.ground,
            i.innings_label,
            d.row_order,
            d.batsman,
            d.batting_hand,
            d.bowling_end,
            d.side_of_wicket,
            d.over_ball,
            d.over_number,
            d.ball_number,
            d.line,
            d.length,
            d.runs_off_bat,
            d.is_wicket,
            d.run_type,
            d.dismissal_type,
            d.wicket_explanation,
            d.area_scored,
            d.shot,
            d.contact,
            d.is_legal_delivery,
            d.counts_for_economy
        FROM bowling_deliveries d
        JOIN bowling_innings i ON d.bowling_innings_id = i.id
        JOIN matches m ON i.match_id = m.id
    """
    with get_connection() as conn:
        return pd.read_sql_query(query, conn)


def load_batting_deliveries() -> pd.DataFrame:
    """Every batting delivery, joined with its innings/match context."""
    query = """
        SELECT
            d.id,
            d.batting_innings_id,
            m.id AS match_id,
            m.date AS match_date,
            m.competition,
            m.format_tier,
            m.team,
            m.opposition,
            m.ground,
            i.innings_label,
            i.batting_position,
            d.row_order,
            d.bowler,
            d.over_ball,
            d.over_number,
            d.ball_number,
            d.line,
            d.length,
            d.shot,
            d.runs_scored,
            d.is_wicket,
            d.run_type,
            d.dismissal_type,
            d.area_scored,
            d.contact,
            d.counts_as_ball_faced,
            d.counts_for_batsman_runs
        FROM batting_deliveries d
        JOIN batting_innings i ON d.batting_innings_id = i.id
        JOIN matches m ON i.match_id = m.id
    """
    with get_connection() as conn:
        return pd.read_sql_query(query, conn)


# Kept as an alias so any existing bowling-only caller (main.py, the
# demo script) keeps working unchanged while everything migrates to
# the more explicit name.
load_deliveries = load_bowling_deliveries
