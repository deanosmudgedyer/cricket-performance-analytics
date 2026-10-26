import pandas as pd

from app.ingestion.validation import validate_batting, validate_bowling


def _valid_bowling_row(**overrides) -> dict:
    row = {
        "match_date": "2026-09-13",
        "competition": "YesPlay Pro20 Cup",
        "format_tier": "T20",
        "team": "Limpopo Impalas",
        "opposition": "Dafabet Warriors",
        "ground": "Nelson Mandela University Ground",
        "batsman": "Test Batsman",
        "batting_hand": "Right",
        "bowling_end": "City End",
        "side_of_wicket": "Over",
        "over_raw": 1.1,
        "line": "Off Stump",
        "length": "Good",
        "result": 0,
        "shot": "Defend",
        "contact": "Contact",
        "type_of_run": "Runs",
        "area_scored": None,
        "wicket_explanation": None,
    }
    row.update(overrides)
    return row


def test_format_tier_blank_is_blocking():
    df = pd.DataFrame([_valid_bowling_row(format_tier=None)])
    issues = validate_bowling(df)
    assert any(i.blocking and "format_tier" in i.message for i in issues)


def test_format_tier_outside_known_three_is_blocking():
    # Regression test: format is a required, explicit field precisely
    # because a competition name (e.g. "YesPlay Pro20 Cup") can't be
    # trusted to say what format it was. A typo'd or invented Format
    # value would create exactly the same "invisible match" bug that
    # motivated dropping keyword-based classification in the first
    # place, so this must block, not just warn.
    df = pd.DataFrame([_valid_bowling_row(format_tier="Frist Class")])
    issues = validate_bowling(df)
    assert any(i.blocking and "Frist Class" in i.message for i in issues)


def test_one_of_the_three_known_tiers_raises_no_format_issue():
    df = pd.DataFrame([_valid_bowling_row(format_tier="First Class")])
    issues = validate_bowling(df)
    assert not any("format_tier" in i.message for i in issues)


def _valid_batting_row(**overrides) -> dict:
    row = {
        "match_date": "2026-09-13",
        "competition": "YesPlay Pro20 Cup",
        "format_tier": "T20",
        "team": "Limpopo Impalas",
        "opposition": "Dafabet Warriors",
        "ground": "Nelson Mandela University Ground",
        "bowler": "N Smith",
        "bowler_type": "Right Arm Fast",
        "batting_position": 4,
        "over_raw": 1.1,
        "line": "Off Stump",
        "length": "Good",
        "result": 0,
        "shot": "Defend",
        "contact": "Contact",
        "type_of_run": "Runs",
        "area_scored": None,
    }
    row.update(overrides)
    return row


def test_bowler_type_outside_known_six_is_flagged_not_blocking():
    # Unlike format_tier, a stray Bowler Type value isn't structurally
    # dangerous (nothing crashes, no match goes invisible) - it's
    # advisory, matching Length/Line's existing treatment.
    df = pd.DataFrame([_valid_batting_row(bowler_type="Underarm Lobs")])
    issues = validate_batting(df)
    matching = [i for i in issues if "bowler_type" in i.message and "Underarm Lobs" in i.message]
    assert len(matching) == 1
    assert not matching[0].blocking


def test_blank_bowler_type_is_not_flagged_as_an_unexpected_value():
    # A blank Bowler Type is the EXPECTED state for a not-yet-assigned
    # bowler (see schema.sql's comment on the nullable column) - it
    # must not also trip the "outside the usual set" check meant for
    # typos, or every unassigned row would double-report.
    df = pd.DataFrame([_valid_batting_row(bowler_type=None)])
    issues = validate_batting(df)
    assert not any("outside the usual set" in i.message and "bowler_type" in i.message for i in issues)


def test_unassigned_bowler_is_surfaced_with_name_not_just_a_count():
    df = pd.DataFrame([_valid_batting_row(bowler_type=None, bowler="N Smith")])
    issues = validate_batting(df)
    matches = [i for i in issues if "Bowler Type yet" in i.message]
    assert len(matches) == 1
    assert "N Smith" in matches[0].message
    assert not matches[0].blocking


def test_fully_assigned_bowler_raises_no_unassigned_note():
    df = pd.DataFrame([_valid_batting_row(bowler_type="Left Arm Wrist Spin")])
    issues = validate_batting(df)
    assert not any("Bowler Type yet" in i.message for i in issues)
