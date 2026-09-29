-- Cricket Analytics Database Schema
--
-- This is the M1 schema: Thomas Mayes' bowling AND batting, across
-- multiple matches/competitions/formats. It replaces the earlier
-- single-bowler/single-match placeholder schema now that real match
-- metadata (date, competition, opposition, ground) and real wickets
-- exist in the data.
--
-- Design choice: there is exactly one tracked player (Thomas Mayes),
-- so unlike the earlier schema there's no `bowlers` table - a
-- multi-player abstraction would be premature for a personal
-- analytics tool with one subject. Opponents (batsmen Thomas bowls
-- to, bowlers Thomas faces) are stored as plain text, same as before,
-- because they're context for a delivery, not entities we track
-- independently (no opponent-side stats are being built).
--
-- `matches` is shared between bowling and batting because the same
-- real-world match can appear in both datasets (Thomas bowls in it
-- AND bats in it) - sharing this table is what lets a future
-- "match report" show both disciplines for one match without
-- duplicating date/competition/ground metadata or risking it drifting
-- out of sync between two copies.
--
-- The old placeholder tables (bowlers/innings/deliveries) are dropped
-- below rather than migrated: they held exactly one hardcoded
-- bowler/match/innings with no real match metadata, entirely
-- superseded by the dataset this schema is built for. Re-ingesting
-- from the source workbook (see app/ingestion/load_spreadsheet.py)
-- is the only way this database is ever populated, so there's no
-- data to lose. These three names are unique to the old schema (the
-- new tables are bowling_deliveries/bowling_innings/batting_*), so
-- DROP IF EXISTS here is a permanent no-op once the one-time
-- migration has happened - safe to run on every init_schema() call.
--
-- `matches` is NOT included in this list even though its shape also
-- changed (old: a free-text description; new: real date/competition/
-- team/opposition/ground columns): unlike the other three, "matches"
-- is also the CURRENT name, so unconditionally dropping it here would
-- fight the live data + foreign keys from the last ingestion run on
-- every subsequent run. Its one-time shape migration is instead
-- handled in Python - see database.py's init_schema().
DROP TABLE IF EXISTS deliveries;
DROP TABLE IF EXISTS innings;
DROP TABLE IF EXISTS bowlers;

CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,              -- ISO date, e.g. "2026-05-23"
    competition TEXT NOT NULL,       -- e.g. "Test Match", "CSA Pro50 Shiled: Div 2"
    -- A required, explicit column in the source data ("Format" - see
    -- app/services/template.py's strict dropdown): "First Class" /
    -- "50-Over" / "T20", entered directly rather than guessed from
    -- `competition`. This used to be inferred via keyword matching on
    -- the competition name, which broke the moment a real competition
    -- was sponsor-branded without an obvious keyword in it (e.g.
    -- "YesPlay Pro20 Cup" has no literal "t20") - see
    -- app/services/cricket_common.py's ALL_TIERS comment for the full
    -- story of why that approach was dropped.
    format_tier TEXT NOT NULL,
    team TEXT NOT NULL,              -- Thomas's team for this match
    opposition TEXT NOT NULL,
    ground TEXT NOT NULL,
    UNIQUE (date, competition, team, opposition, ground)
);

-- One row per innings Thomas bowled in. Usually one per match, but a
-- multi-day format could have two (1st/2nd Innings). For limited-overs
-- formats the source data doesn't record a real innings number - see
-- innings_label comment below.
CREATE TABLE IF NOT EXISTS bowling_innings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    -- "1st Innings" / "2nd Innings" for multi-innings formats, or a
    -- format label like "List A" when the source data doesn't
    -- distinguish an innings number (limited-overs matches only have
    -- one innings per side, so there's nothing to distinguish anyway -
    -- this column is deliberately NOT interpreted as "innings 1 vs 2"
    -- for those formats; see app/services/cricket_common.py).
    innings_label TEXT NOT NULL,
    UNIQUE (match_id, innings_label)
);

CREATE TABLE IF NOT EXISTS bowling_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bowling_innings_id INTEGER NOT NULL REFERENCES bowling_innings(id),

    -- Preserves original spreadsheet row order within the innings.
    -- Needed because Over/ball alone isn't a unique key: a no-ball's
    -- re-bowled delivery can share the same over.ball value as the
    -- no-ball itself (see 44.1 appearing twice in the Test innings).
    row_order INTEGER NOT NULL,

    batsman TEXT NOT NULL,
    batting_hand TEXT NOT NULL,        -- Right / Left, as recorded
    bowling_end TEXT NOT NULL,
    side_of_wicket TEXT NOT NULL,      -- "Over the Wicket" / "Around the Wicket"

    over_ball TEXT NOT NULL,           -- "7.2" as-recorded, for display
    over_number INTEGER NOT NULL,
    ball_number INTEGER NOT NULL,

    line TEXT NOT NULL,
    length TEXT NOT NULL,

    runs_off_bat INTEGER NOT NULL DEFAULT 0,
    is_wicket INTEGER NOT NULL DEFAULT 0,

    -- Runs / Leg Bye / Bye / Wide / No Ball when is_wicket = 0.
    -- NULL when is_wicket = 1 (the source spreadsheet reuses this
    -- column to hold the dismissal type instead - split out below so
    -- "what kind of run" and "what kind of dismissal" are never
    -- conflated by downstream code).
    run_type TEXT,
    dismissal_type TEXT,               -- Bowled / LBW / Caught / etc. when is_wicket = 1
    wicket_explanation TEXT,           -- e.g. "Caught at Deep Cover"

    area_scored TEXT,                  -- NULL when no shot data / no run
    shot TEXT NOT NULL,
    contact TEXT NOT NULL,             -- Contact / Miss / Edge / Leave (normalised casing)

    -- Derived flags, computed once at ingestion so every downstream
    -- query and stat is guaranteed consistent (no repeated business logic).
    is_legal_delivery INTEGER NOT NULL DEFAULT 1,   -- 0 for Wide / No Ball
    counts_for_economy INTEGER NOT NULL DEFAULT 1   -- 0 for Leg Bye / Bye
);

CREATE INDEX IF NOT EXISTS idx_bowl_del_innings ON bowling_deliveries(bowling_innings_id);
CREATE INDEX IF NOT EXISTS idx_bowl_del_batsman ON bowling_deliveries(batsman);
CREATE INDEX IF NOT EXISTS idx_bowl_del_over ON bowling_deliveries(over_number);

-- One row per innings Thomas batted in.
CREATE TABLE IF NOT EXISTS batting_innings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    innings_label TEXT NOT NULL,       -- same convention as bowling_innings.innings_label
    batting_position INTEGER NOT NULL,
    UNIQUE (match_id, innings_label)
);

CREATE TABLE IF NOT EXISTS batting_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batting_innings_id INTEGER NOT NULL REFERENCES batting_innings(id),

    row_order INTEGER NOT NULL,

    bowler TEXT NOT NULL,

    over_ball TEXT NOT NULL,
    over_number INTEGER NOT NULL,
    ball_number INTEGER NOT NULL,

    line TEXT NOT NULL,
    length TEXT NOT NULL,
    shot TEXT NOT NULL,

    runs_scored INTEGER NOT NULL DEFAULT 0,   -- 0 whenever is_wicket = 1 in this dataset
    is_wicket INTEGER NOT NULL DEFAULT 0,

    run_type TEXT,                     -- Runs / Leg Byes / Byes when is_wicket = 0
    dismissal_type TEXT,               -- mode of dismissal when is_wicket = 1

    area_scored TEXT,                  -- scoring area, or dismissal area if out
    contact TEXT NOT NULL,

    -- Balls faced excludes Wides (the striker isn't credited with
    -- facing a wide) but includes No Balls (a fair-height/width ball
    -- was still delivered to bat at) - this is the ESPNcricinfo/
    -- standard scorecard convention. Flagged explicitly because the
    -- source spreadsheet doesn't state a convention either way.
    counts_as_ball_faced INTEGER NOT NULL DEFAULT 1,
    -- Runs credited to the batsman exclude Leg Byes/Byes. A No Ball's
    -- recorded Result in this dataset is the single penalty-run value
    -- (see app/ingestion/load_batting.py for the caveat about
    -- no-ball + bat-runs both happening on one delivery - the sheet
    -- has no way to record both).
    counts_for_batsman_runs INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_bat_del_innings ON batting_deliveries(batting_innings_id);
CREATE INDEX IF NOT EXISTS idx_bat_del_bowler ON batting_deliveries(bowler);
CREATE INDEX IF NOT EXISTS idx_bat_del_over ON batting_deliveries(over_number);
