"""
Generic delivery filtering, shared by bowling and batting.

The original version of this file hand-enumerated one dataclass field
per filterable column (batsman, bowling_end, length, ...). That works
fine for 6 filters; the full spec calls for ~25 bowling filter
dimensions and ~20 batting ones, and duplicating that per discipline
would mean every new filterable column needs a matching field added
in two places (plus the query-param plumbing in main.py) forever.

Instead: `equals` is just {column_name: [allowed values]} - any column
that exists in the DataFrame is filterable with zero code changes here.
Each API endpoint still validates which column names it accepts (see
main.py's per-discipline allow-lists) so a typo'd or malicious query
param can't probe arbitrary columns; this module itself stays generic
and dumb on purpose, exactly like the old one - it answers "which
rows survive the filters", nothing about what those columns mean.

date_from/date_to are a separate pair of fields (not folded into
`equals`) for the same reason over_min/over_max are: a date is a
*range* selection (the spec's "date-range or season selector"), not a
pick-from-a-value-list one - a dropdown of every distinct date a
career eventually spans doesn't scale the way a dropdown of grounds or
oppositions does.
"""
from dataclasses import dataclass, field

import pandas as pd


@dataclass
class DeliveryFilters:
    # column name -> list of allowed values (an isin() filter).
    equals: dict[str, list] = field(default_factory=dict)
    over_min: int | None = None
    over_max: int | None = None
    specific_overs: list[int] | None = None
    # ISO date strings ("2026-05-23") - compare correctly as plain
    # strings since match_date is stored/loaded in ISO form throughout.
    date_from: str | None = None
    date_to: str | None = None


def apply_filters(df: pd.DataFrame, filters: DeliveryFilters) -> pd.DataFrame:
    result = df

    for column, values in filters.equals.items():
        if values:
            result = result[result[column].isin(values)]

    if filters.over_min is not None:
        result = result[result["over_number"] >= filters.over_min]

    if filters.over_max is not None:
        result = result[result["over_number"] <= filters.over_max]

    if filters.specific_overs:
        result = result[result["over_number"].isin(filters.specific_overs)]

    if filters.date_from is not None:
        result = result[result["match_date"] >= filters.date_from]

    if filters.date_to is not None:
        result = result[result["match_date"] <= filters.date_to]

    return result
