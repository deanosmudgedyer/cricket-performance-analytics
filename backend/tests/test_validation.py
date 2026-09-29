import pandas as pd

from app.ingestion.validation import validate_bowling


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
