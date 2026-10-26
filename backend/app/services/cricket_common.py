"""
Small helpers shared by bowling_stats.py and batting_stats.py, plus
the sample-size thresholds used platform-wide to gate any claim that
could otherwise mislead from a handful of deliveries.

Centralising the thresholds here (rather than duplicating per-module
copies, as the original bowling-only insights.py did) means "how much
data is enough to say something" is one tunable decision, applied
consistently to bowling and batting alike.
"""

# Below this many balls, a group's rate stats (economy, strike rate,
# dot %, etc.) are still returned - the numbers aren't hidden - but
# any UI or insight built on them should render a visible "small
# sample" warning rather than presenting the number with confidence.
SMALL_SAMPLE_BALLS = 12          # two overs
# Below this many dismissals, average/dismissal-rate claims are
# especially unstable - cricket averages need even more than 12 balls
# worth of wickets to mean anything, since wickets are rare events.
SMALL_SAMPLE_WICKETS = 3
# Rankings/insights (e.g. "best length") shouldn't be drawn from
# groups smaller than this at all.
MIN_BALLS_FOR_INSIGHT = 6

# The three format tiers a coach actually separates in their head,
# because the stats that matter differ by tier (batting strike rate
# barely matters in a Test innings, is central in T20) - see
# HomeDashboard.tsx, which never blends these on a summary view.
#
# This used to be GUESSED from the free-text Competition name via
# keyword matching (app/services/format_classification.py, since
# removed) - "Test"/"Day" for First Class, "50"/"ODI"/"List A" for
# 50-Over, "T20" for T20. That broke the moment a real competition was
# sponsor-branded in a way that didn't contain its own keyword (e.g.
# "YesPlay Pro20 Cup" has no literal "t20" in it), silently filing the
# match under "Unclassified" - which has no tab anywhere in the app,
# so the match became invisible rather than just mislabelled. Format
# is now a required, explicit column in the source data (see
# app/services/template.py's strict dropdown) precisely so a new
# sponsor name can never again cause a match to vanish.
FIRST_CLASS = "First Class"
FIFTY_OVER = "50-Over"
T20 = "T20"
ALL_TIERS = [FIRST_CLASS, FIFTY_OVER, T20]


def format_overs(legal_balls: int) -> str:
    """23 legal balls -> '3.5' (3 overs, 5 balls), matching scorecards."""
    return f"{legal_balls // 6}.{legal_balls % 6}"


def safe_round(value, digits: int = 2):
    return None if value is None else round(value, digits)


def safe_ratio(numerator: float, denominator: float, digits: int = 2):
    """None (not 0 or an exception) when the denominator is 0 - "no
    data" and "a rate of zero" are different things and should never
    be conflated (e.g. an average of 0.00 reads as "concedes nothing
    per wicket", not "no wickets yet")."""
    if not denominator:
        return None
    return safe_round(numerator / denominator, digits)


def bucket_by_over(df, breakpoints: list[int], compute_stats_fn, cycle_length: int | None = None) -> list[dict]:
    """
    Splits `df` into phases by innings-absolute over number and
    returns full stats for each - shared by bowling's spell analysis
    and batting's innings-progression analysis, since "bucket balls by
    over range, then compute the same stats as everywhere else" isn't
    a bowling or batting concept, it's a phase concept.

    `breakpoints` are the LAST over of every phase except the final
    one, e.g. [6, 15] over a 20-over innings makes phases 1-6, 7-15,
    16-20 - deliberately not hardcoded to Powerplay/Death terminology
    here, since a 4-day innings has no such structure (that framing
    belongs at the API/frontend layer, which knows the format tier;
    this function only knows over numbers). Phases with zero balls
    (e.g. a breakpoint past the innings' actual length) are omitted
    rather than shown as an empty row.

    `cycle_length`, when given, models a new ball being taken every N
    overs (First Class cricket: every 80) - "ball age" then resets
    instead of climbing forever, so over 81 is bucketed as a fresh new
    ball (position 1 of the next cycle), not lumped into an ever-older
    "Old Ball" phase alongside overs that never actually saw that same
    ball. Every cycle's same-aged overs are merged into one combined
    phase (over 10 and over 90 both land in the first phase) rather
    than shown as separate bars, since they're the same cricket
    situation recurring, not a new one.
    """
    if df.empty:
        return []

    if cycle_length:
        # 1-indexed position within the current new-ball cycle, e.g.
        # over 81 -> 1, over 90 -> 10, over 160 -> 80, over 161 -> 1.
        over_in_cycle = ((df["over_number"] - 1) % cycle_length) + 1
        max_over = cycle_length
    else:
        over_in_cycle = df["over_number"]
        max_over = int(df["over_number"].max())

    edges = sorted({bp for bp in breakpoints if 0 < bp < max_over})
    starts = [1] + [edge + 1 for edge in edges]
    ends = edges + [max_over]

    phases = []
    for start, end in zip(starts, ends):
        phase_df = df[(over_in_cycle >= start) & (over_in_cycle <= end)]
        stats = compute_stats_fn(phase_df)
        # balls_bowled (bowling) or balls_faced (batting) - whichever
        # this stats function produced - decides whether to include
        # an empty phase.
        ball_count = stats.get("balls_bowled", stats.get("balls_faced", 0))
        if ball_count == 0:
            continue
        phases.append({"over_start": start, "over_end": end, "over_range": f"{start}-{end}", **stats})
    return phases


def phase_gap_note(
    phases: list[dict], rate_key: str, count_key: str, min_balls: int, gap_threshold: float
) -> tuple[dict, dict, float] | None:
    """
    Compares the first and last phase with enough balls to trust, on
    one rate metric. Returns None (no note) unless both phases clear
    the sample floor AND the gap between them clears a meaningful
    threshold - a small wobble between two thin samples isn't a trend.

    Deliberately returns the raw (first, last, gap) rather than a
    finished sentence: callers phrase it ("appears to decline", never
    "declines" or "fatigues" - see this project's insight-wording rule
    of describing an observed pattern without asserting its cause).
    """
    eligible = [p for p in phases if p.get(count_key, 0) >= min_balls and p.get(rate_key) is not None]
    if len(eligible) < 2:
        return None
    first, last = eligible[0], eligible[-1]
    gap = last[rate_key] - first[rate_key]
    if abs(gap) < gap_threshold:
        return None
    return first, last, gap
