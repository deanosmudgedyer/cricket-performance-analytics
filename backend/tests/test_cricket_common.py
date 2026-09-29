from app.services.cricket_common import bucket_by_over, format_overs, phase_gap_note, safe_ratio, safe_round


def test_safe_ratio_returns_none_not_zero_when_denominator_is_zero():
    # An average of 0.00 would misleadingly read as "concedes nothing
    # per wicket" - it must be None ("no data yet"), not 0.
    assert safe_ratio(10, 0) is None


def test_safe_ratio_divides_and_rounds():
    assert safe_ratio(10, 4) == 2.5
    assert safe_ratio(1, 3, digits=2) == 0.33


def test_safe_round_passes_through_none():
    assert safe_round(None) is None
    assert safe_round(1.23456, 2) == 1.23


def test_format_overs_matches_scorecard_convention():
    assert format_overs(0) == "0.0"
    assert format_overs(6) == "1.0"
    assert format_overs(23) == "3.5"


def test_bucket_by_over_splits_on_breakpoints():
    import pandas as pd

    df = pd.DataFrame({"over_number": [1, 2, 7, 8, 16, 17]})

    def fake_stats(phase_df):
        return {"balls_bowled": len(phase_df)}

    phases = bucket_by_over(df, breakpoints=[6, 15], compute_stats_fn=fake_stats)

    assert [p["over_range"] for p in phases] == ["1-6", "7-15", "16-17"]
    assert [p["balls_bowled"] for p in phases] == [2, 2, 2]


def test_bucket_by_over_omits_empty_phases():
    import pandas as pd

    df = pd.DataFrame({"over_number": [1, 2, 17]})

    def fake_stats(phase_df):
        return {"balls_bowled": len(phase_df)}

    phases = bucket_by_over(df, breakpoints=[6, 15], compute_stats_fn=fake_stats)

    # The 7-15 phase has zero balls and should not appear as an empty row.
    assert [p["over_range"] for p in phases] == ["1-6", "16-17"]


def test_phase_gap_note_requires_two_eligible_phases():
    phases = [{"economy": 4.0, "balls_bowled": 12}]
    assert phase_gap_note(phases, "economy", "balls_bowled", min_balls=6, gap_threshold=1.0) is None


def test_phase_gap_note_ignores_gap_below_threshold():
    phases = [
        {"economy": 4.0, "balls_bowled": 12},
        {"economy": 4.3, "balls_bowled": 12},
    ]
    assert phase_gap_note(phases, "economy", "balls_bowled", min_balls=6, gap_threshold=1.0) is None


def test_phase_gap_note_reports_a_real_gap():
    phases = [
        {"economy": 3.0, "balls_bowled": 12},
        {"economy": 6.0, "balls_bowled": 12},
    ]
    result = phase_gap_note(phases, "economy", "balls_bowled", min_balls=6, gap_threshold=1.0)

    assert result is not None
    first, last, gap = result
    assert first["economy"] == 3.0
    assert last["economy"] == 6.0
    assert gap == 3.0
