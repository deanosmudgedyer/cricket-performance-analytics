"""
Run this to sanity-check both stats engines against the real data.

    python -m app.analysis_demo

Prints overall bowling and batting figures (cross-check by eye against
the spreadsheet / a scorecard), plus one filtered example each.
"""
from app.services.batting_stats import compute_batting_stats
from app.services.cricket_stats import compute_bowling_stats, economy_by_group
from app.services.filters import DeliveryFilters, apply_filters


def print_stats(label: str, stats: dict) -> None:
    print(f"\n--- {label} ---")
    for key, value in stats.items():
        if key.endswith("_distribution"):
            continue
        print(f"{key:24}: {value}")


def main():
    from app.services.data_access import load_batting_deliveries, load_bowling_deliveries

    bowling = load_bowling_deliveries()
    batting = load_batting_deliveries()
    print(f"Loaded {len(bowling)} bowling deliveries across {bowling['match_id'].nunique()} match(es).")
    print(f"Loaded {len(batting)} batting deliveries across {batting['match_id'].nunique()} match(es).")

    print_stats("BOWLING - OVERALL", compute_bowling_stats(bowling))
    print_stats("BATTING - OVERALL", compute_batting_stats(batting))

    print("\n--- BOWLING: economy by length ---")
    by_length = economy_by_group(bowling, "length")
    print(by_length[["length", "balls_bowled", "runs_conceded", "wickets", "economy", "average", "dot_ball_pct"]])

    print("\n--- BOWLING: by competition ---")
    by_comp = economy_by_group(bowling, "competition")
    print(by_comp[["competition", "balls_bowled", "overs", "runs_conceded", "wickets", "economy"]])

    filtered = apply_filters(bowling, DeliveryFilters(equals={"batting_hand": ["Left"]}))
    print_stats("BOWLING - FILTERED: vs Left-handers", compute_bowling_stats(filtered))

    print("\n--- BATTING: by competition ---")
    from app.services.batting_stats import batting_by_group

    bat_by_comp = batting_by_group(batting, "competition")
    print(bat_by_comp[["competition", "balls_faced", "runs", "dismissals", "strike_rate", "average"]])


if __name__ == "__main__":
    main()
