import pandas as pd

from app.services.filters import DeliveryFilters, apply_filters


def make_df():
    return pd.DataFrame(
        {
            "length": ["Good", "Full", "Short", "Good", "Yorker"],
            "over_number": [1, 5, 10, 15, 20],
            "match_date": ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"],
        }
    )


def test_equals_filters_on_any_column_with_no_new_code():
    result = apply_filters(make_df(), DeliveryFilters(equals={"length": ["Good"]}))
    assert list(result["length"]) == ["Good", "Good"]


def test_equals_filter_with_multiple_allowed_values():
    result = apply_filters(make_df(), DeliveryFilters(equals={"length": ["Good", "Yorker"]}))
    assert set(result["length"]) == {"Good", "Yorker"}


def test_over_range_filter():
    result = apply_filters(make_df(), DeliveryFilters(over_min=5, over_max=15))
    assert list(result["over_number"]) == [5, 10, 15]


def test_specific_overs_filter():
    result = apply_filters(make_df(), DeliveryFilters(specific_overs=[1, 20]))
    assert list(result["over_number"]) == [1, 20]


def test_date_range_filter():
    result = apply_filters(make_df(), DeliveryFilters(date_from="2026-02-01", date_to="2026-04-01"))
    assert list(result["over_number"]) == [5, 10, 15]


def test_combined_filters():
    filters = DeliveryFilters(equals={"length": ["Good"]}, over_min=10)
    result = apply_filters(make_df(), filters)
    assert list(result["over_number"]) == [15]


def test_no_filters_returns_everything():
    result = apply_filters(make_df(), DeliveryFilters())
    assert len(result) == 5
