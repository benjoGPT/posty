# How accurate is the map?

The numbers come from `npm run data:crosscheck`, which compares the dataset with
three sources that were **not** used to build it. The full generated tables are
in [ACCURACY_REPORT.md](ACCURACY_REPORT.md). The app shows a summary under
*About the data*.

```bash
npm run data:crosscheck -- --source onspd --input raw/ONSPD_FEB_2026_UK.csv
```

Without `--input` it compares only the published detail areas. The reference
files are downloaded once into `raw/crosscheck/`.

## Results (October 2026 check of the February 2026 data)

### 1. Official ONSPD rows (postcodes.io database sample)

postcodes.io publishes a sample of its production database (real ONSPD rows,
newest introduced July 2026) for its test suite. It is mostly Aberdeen (AB), so it
tests the dataset as a whole rather than Shropshire specifically.

- **99.7%** of 4,210 live postcodes are present; **95.5%** are at the
  *identical* position (< 1 m); median difference 0 m.
- **99.8%** of 3,874 terminated postcodes are correctly absent.
- Every mismatch is explained by timing: the sample is ~5 months newer, so it
  includes postcodes created since February (e.g. new-build AB16 9F_ / 9G_) and
  ones retired since, plus some positions ONS has since refined.

**What this tells us:** the unofficial npm copy really is ONSPD February 2026
as it claims. That's strong evidence, though not proof for every row; rebuilding
from the official download remains the way to be sure.

### 2. Independent coordinate list (dwyl, October 2017)

An openly published list of ~1.7 million UK postcode coordinates.

| Area | Compared | Median difference | Within 100 m |
|---|---|---|---|
| SY | 13,929 | 2.7 m | 96.0% |
| TF | 6,608 | 2.1 m | 97.7% |
| WV | 10,062 | 2.2 m | 98.9% |
| DY | 10,675 | 2.7 m | 98.6% |
| Rest of GB | 1,589,819 | 2.2 m | 98.4% |

The 2–3 m typical difference is from different coordinate conversions. Larger
differences are mostly postcodes ONS has repositioned since 2017; rural SY has
the most because rural positions are coarser and get refined more often.

Spot-checks of the 10 largest differences in the detail areas (each position
tested against the Wikipedia district outline and its neighbouring postcodes):

- **Current data looks right in 8 cases.** For example TF9 2LX: the 2017 position
  is 20 km away and outside TF9 entirely.
- **2 cases look like problems in the current data and are worth checking
  against the official release:**
  - **WV3 7LF:** the current position lies outside WV3 and 2.6 km from the
    rest of its sector; the 2017 position fits.
  - **SY25 6NP:** both positions are about 3 km from the rest of the sector.

### 3. District boundaries vs Wikipedia outlines

Wikipedia's postcode district maps (via `missinglink/uk-postcode-polygons`) are
an independently drawn estimate of the same boundaries.

| Area | Postcode points inside own district (ours) | (Wikipedia) | Land where both agree |
|---|---|---|---|
| SY | 99.2% | 99.3% | 99.3% |
| TF | 99.5% | 97.9% | 99.0% |
| WV | 98.8% | 90.5% | 99.2% |
| DY | 99.7% | 99.2% | 99.4% |

The two sets of boundaries agree on about 99% of the land. Measured against
where the postcodes actually are, ours match as well as or better than
Wikipedia's (WV's Wikipedia outlines are noticeably older).

## Known limitations

- Boundaries are estimates (see [DATA_SOURCES.md](DATA_SOURCES.md)). Edges in
  sparsely populated countryside can be off by hundreds of metres.
- The data is a snapshot (February 2026). New postcodes appear in search via
  postcodes.io but not on the map until the data is rebuilt.
- A few individual positions are questionable (above). They come from the
  source data; the map shows them as published rather than "correcting" them.
