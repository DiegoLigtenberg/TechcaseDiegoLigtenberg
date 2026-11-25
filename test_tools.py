import tools


def test_data_loads():
    """The real catalog and rights files load. If this fails, every answer is empty."""
    tools.load_data()
    catalog = tools.data["catalog"]

    assert len(catalog) > 0
    assert list(catalog.columns) == [
        "track_id",
        "isrc",
        "title",
        "artist",
        "label",
        "release_year",
    ]
    halo = catalog[(catalog["title"] == "Halo") & (catalog["artist"] == "Beyonce")]
    assert len(halo) == 1
    assert halo.iloc[0]["isrc"] == "NLRS92411090"

    assert tools.data["rights_header"].startswith("isrc;")
    assert len(tools.data["rights_lines"]) > 0


def test_find_tracks_adds_the_license():
    """A track search returns that recording and the license with the same ISRC. Catalog questions depend on that link."""
    tools.load_data()
    text = tools.find_tracks(title="Halo", artist="Beyonce")

    assert "Halo | Beyonce | isrc=NLRS92411090 | year=2008" in text
    assert "eind=31/12/2025 | pct=8 % | sync=alleen BENELUX" in text


def test_find_licenses_filters_by_end_year():
    """A year search keeps only rows whose license end date is that year. The model never sees the rows this drops."""
    tools.load_data()
    text = tools.find_licenses(end_year=2025)

    summaries = [line for line in text.splitlines() if "eind=" in line]
    assert len(summaries) > 0
    for line in summaries:
        assert "2025" in line.split("eind=", 1)[1]
