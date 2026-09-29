# Methodology

This document explains what the app actually measures, how, and where those
measurements stop being reliable. It exists so a reader can check any number
the dashboard shows against a clear, specific rule rather than trusting it
blindly.

## What's captured per delivery

The source data is ball-by-ball, not innings summaries. Every delivery Thomas
bowled or faced is one row, recording (where applicable): date, competition,
ground, team, opposition, innings, over and ball number, line, length, shot
played, contact type, runs, wicket details, and — for bowling — the batter's
batting hand, which end Thomas bowled from, and which side of the wicket he
bowled from.

From these raw fields, four flags are derived once at ingestion time, so every
statistic downstream reads the same underlying facts rather than
re-implementing cricket's scoring rules in five different places:

| Flag | Meaning |
|---|---|
| `is_legal_delivery` | 0 for a Wide or No Ball (doesn't count as a ball bowled) |
| `counts_for_economy` | 0 for a Leg Bye or Bye; wide/no-ball penalty runs still count against the bowler |
| `counts_as_ball_faced` | 0 for a Wide (striker isn't credited with facing it), 1 for a No Ball (a fair-height/width ball was still delivered to bat at) |
| `counts_for_batsman_runs` | 0 for a Leg Bye or Bye (extras, not runs off the bat) |

The ball-faced and batsman-runs conventions follow standard scorecard
practice (the same convention ESPNcricinfo uses), chosen because the source
spreadsheet didn't specify a convention either way and this is the one a
cricket-literate reader will expect.

## How bowling performance is measured

Bowling figures are computed directly from deliveries, not from a
pre-aggregated summary row, so any filter (ground, opponent, length, phase of
innings, date range) produces figures with the same definitions as the
overall career numbers:

- **Overs bowled** — legal deliveries only, formatted `overs.balls` (e.g. 23
  legal balls → `3.5`).
- **Economy** — runs that count for economy ÷ overs bowled.
- **Average** — runs conceded ÷ wickets taken (shown as `—`, not `0.00`, when
  there are no wickets yet — see "no data vs. a rate of zero" below).
- **Strike rate** — legal balls bowled ÷ wickets taken.
- **Dot ball %** — legal deliveries with zero runs and no wicket, ÷ legal
  deliveries.
- **Maidens** — a genuinely innings-scoped stat: an over only counts as a
  maiden if every legal ball in *that specific over, in that specific
  innings* conceded nothing countable. This can't be computed correctly from
  a ball-level groupby (grouping by length or line, for example, would
  silently break an over apart and miscount it), so it's computed separately
  by walking innings-by-innings, over-by-over.

## How batting performance is measured

The same ball-level approach applies to batting, with the innings-vs-ball
distinction handled the same deliberate way:

- **Runs, balls faced, strike rate** — computed the same way regardless of
  filter, using the flags above.
- **Highest score, not-outs, 50s/100s** — like maidens, these are properties
  of a whole innings, not of an arbitrary set of balls. Filtering to "balls
  against pace bowling," for instance, does not change what Thomas's highest
  score was — that number only makes sense computed per-innings, once, and is
  kept separate from the ball-level filtering system rather than being
  (incorrectly) recomputed under every filter.
- **Dismissal analysis** — how Thomas got out, broken down by dismissal type,
  shot played, and bowler characteristics, to distinguish technique problems
  from bad luck or good bowling.

## Format tiers, and why they're never blended

Cricket's formats aren't comparable on the same axis — a Test-match strike
rate and a T20 strike rate answer different questions, and averaging them
together answers neither. Every match is classified into one of three tiers
at ingestion time, from the free-text competition name:

- **First Class** — Test cricket (international) and 3-Day/4-Day cricket
  (domestic). Two innings per side.
- **50-Over** — ODI (international) and List A (domestic). One innings per
  side.
- **T20** — T20I (international) and domestic T20. One innings per side.

The source spreadsheet has no explicit "format" column, only a competition
name (e.g. "Test Match", "CSA Pro50 Shield: Div 2"), so the tier is inferred
by keyword match against that name (see
[`format_classification.py`](../backend/app/services/format_classification.py)).
A competition name that matches none of the known keywords is labelled
**Unclassified** rather than guessed — the in-app data quality checks flag
these so a new competition naming pattern gets a deliberate rule added,
instead of silently landing in the wrong tier. This choice trades a small
amount of automation for the guarantee that no match is ever misclassified
without someone noticing.

The dashboard never mixes tiers in a single stat or chart; each tier's view
is computed and shown independently.

## Phase-of-innings analysis

Deliveries are grouped into phases by over number, so a bowler's or batter's
figures can be compared across the arc of an innings rather than only as one
career-long average. Phase boundaries differ by format, because they
represent real, different things:

| Tier | Phases |
|---|---|
| T20 | Powerplay (overs 1–6), Middle (7–15), Death (16–20) |
| 50-Over | Powerplay (1–10), Middle (11–40), Death (41–50) |
| First Class | New Ball (1–10), Early-Middle (11–40), Middle-Late (41–80), Old Ball (81+) |

First Class cricket has no real "powerplay" or "death overs" structure, so
its phases are deliberately labelled by ball condition (new ball vs. old
ball) instead of borrowing limited-overs terminology that wouldn't mean
anything in a four-day innings.

Where a phase-to-phase comparison is shown as a note (e.g. "economy appears
to climb through the spell"), it is gated by both phases clearing a minimum
sample size and the gap between them clearing a minimum threshold — a small
wobble between two thin samples is not reported as a trend. The wording is
always deliberately descriptive ("appears to"), never causal: the app has no
basis to say *why* a pattern exists (fatigue, tactics, opposition
adjustment), only that the numbers show it.

## Sample-size discipline

Cricket statistics are noisy over small samples — a single well-timed shot or
one unplayable ball can swing an economy rate or average dramatically. Rather
than hide small-sample numbers, the app computes and shows them but flags
them, using three thresholds applied consistently across bowling and
batting:

- **`SMALL_SAMPLE_BALLS` = 12** (two overs) — below this, rate stats (economy,
  strike rate, dot %) are shown with a visible small-sample warning.
- **`SMALL_SAMPLE_WICKETS` = 3** — below this many wickets, average and
  dismissal-rate figures get an additional warning, since wickets are rare
  events and need more data than balls alone to stabilise.
- **`MIN_BALLS_FOR_INSIGHT` = 6** — the floor below which a group is excluded
  from ranked "insight" lists (e.g. "best length bowled to") entirely, rather
  than shown as a misleadingly confident top result.

## No data vs. a rate of zero

Wherever a rate would require dividing by zero — for example, a bowling
average when no wickets have been taken yet — the app returns nothing
(rendered as `—`) rather than `0`. An average of `0.00` reads as "concedes
nothing per wicket," which is a different (and wrong) claim from "no wickets
have fallen yet." This distinction is applied by a single shared helper
(`safe_ratio`) rather than re-implemented per stat, so it can't be
accidentally skipped in a new metric.

## Filtering and the "combination engine"

Every dimension recorded per delivery (length, line, shot, contact, ground,
opposition, batting hand, over range, date range, and more) can be filtered
on, and multiple dimensions can be combined into one breakdown table (e.g.
"length × batting hand" or "ground × phase") without any dimension-specific
code — the underlying filter and group-by logic is generic over column
names. Each API endpoint still restricts which column names it will accept,
so this generality doesn't turn into an open, unvalidated query surface.

## What this app does *not* do

To be direct about scope, since it's easy to overstate what a personal
analytics tool like this represents:

- **No predictive modelling.** Every number here is descriptive — a
  computed fact about deliveries that were actually bowled or faced, not a
  forecast, projection, or model output.
- **No opposition-side analytics.** Batters Thomas bowled to and bowlers he
  faced are recorded as context for a delivery (to support breakdowns like
  "economy vs. left-handers"), not tracked as entities with their own
  profiles or stats.
- **Single-player scope.** The schema deliberately has no `players` table —
  there is one tracked player, so a multi-player abstraction would be
  premature generality for what this tool is today. Extending it to more
  players is a real possibility (see the README's "possible extensions"), but
  isn't built.
- **Manual, spreadsheet-sourced data.** Deliveries are scored by hand into a
  spreadsheet (or the in-app upload template) rather than pulled from a
  ball-tracking feed or a third-party scoring API. Data quality depends on
  that manual scoring being accurate and consistent — see the in-app "Manage
  Data" tab, which re-validates the source data on every load and flags
  issues like inconsistent spellings of the same value.

## Ideas for future metrics (not implemented)

Documented here rather than silently left out, per the same honesty
principle as the section above — these are directions, not claims about
what exists:

- Bowler-vs-batter head-to-head views, once/if opposition players are
  tracked as entities rather than free text.
- A partnership-level view for batting (currently everything is per-delivery
  or per-innings; there's no notion of "runs added with a specific partner").
- Win/loss or result-outcome correlation (the `matches` table has no result
  field yet — only date/competition/team/opposition/ground).
