"""
Classifies a competition name into one of the three format tiers a
coach actually thinks in - and that must NOT be blended together on a
summary view, since the metrics that matter differ by tier (batting
strike rate is close to meaningless in a Test innings, central in T20).

    First Class  - Test cricket (international level), 3-Day / 4-Day (domestic level). Two innings per side.
    50-Over      - ODI (international), List A (domestic). One innings per side.
    T20          - T20I (international), T20 (domestic). One innings per side.

There is no "format" column in the source spreadsheet - only free-text
`Competition` (e.g. "Test Match", "CSA Pro50 Shiled: Div 2"). Rather
than a brittle exact-match table that breaks the moment Thomas plays
for a new team in a new league, this matches on the words that
actually identify a format across almost any competition name a
domestic or international body would use. New, unrecognised
competition names are labelled "Unclassified" rather than guessed
into a tier - see app/ingestion/validation.py, which flags these so a
new pattern gets noticed and added here deliberately, not silently
misclassified.
"""

FIRST_CLASS = "First Class"
FIFTY_OVER = "50-Over"
T20 = "T20"
UNCLASSIFIED = "Unclassified"

ALL_TIERS = [FIRST_CLASS, FIFTY_OVER, T20]

# Order matters: T20 is checked before "50" so a hypothetical
# "T20 Pro50 Cup"-style name (unlikely, but not impossible) resolves
# to T20 rather than 50-over. First Class keywords are checked last
# since "Test"/"Day" are the least likely to accidentally collide with
# a limited-overs competition's name.
_T20_KEYWORDS = ["t20", "twenty20", "twenty 20"]
_FIFTY_OVER_KEYWORDS = ["50", "odi", "one day", "one-day", "list a"]
_FIRST_CLASS_KEYWORDS = ["test", "first-class", "first class", "day"]


def classify_format(competition: str | None) -> str:
    if not competition:
        return UNCLASSIFIED
    text = competition.lower()

    if any(keyword in text for keyword in _T20_KEYWORDS):
        return T20
    if any(keyword in text for keyword in _FIFTY_OVER_KEYWORDS):
        return FIFTY_OVER
    if any(keyword in text for keyword in _FIRST_CLASS_KEYWORDS):
        return FIRST_CLASS
    return UNCLASSIFIED
