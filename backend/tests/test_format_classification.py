import pytest

from app.services.format_classification import FIFTY_OVER, FIRST_CLASS, T20, UNCLASSIFIED, classify_format


@pytest.mark.parametrize(
    "competition,expected",
    [
        ("Test Match", FIRST_CLASS),
        ("3-Day Match", FIRST_CLASS),
        ("4 Day Provincial Cup", FIRST_CLASS),
        ("ODI", FIFTY_OVER),
        ("One Day International", FIFTY_OVER),
        ("CSA Pro50 Shield: Div 2", FIFTY_OVER),
        ("List A", FIFTY_OVER),
        ("T20I", T20),
        ("Domestic T20 Cup", T20),
        ("Twenty20 Friendly", T20),
        ("Village Friendly", UNCLASSIFIED),
        (None, UNCLASSIFIED),
        ("", UNCLASSIFIED),
    ],
)
def test_classify_format(competition, expected):
    assert classify_format(competition) == expected


def test_t20_keyword_checked_before_fifty_over_keyword():
    # A name containing both a T20 marker and "50" must resolve to T20
    # - the check order exists specifically to avoid this collision.
    assert classify_format("T20 Pro50 Cup") == T20
