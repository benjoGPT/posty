# Accuracy report (generated)

Generated 2026-10-28 by `npm run data:crosscheck` for: ONSPD August 2026. See docs/ACCURACY.md for how to read it.

## 1. Official ONSPD rows from the postcodes.io database (test seed)

| Check | Result |
|---|---|
| Live postcodes in seed | 4,210 |
| … present in our data | 4,210 (100.00%) |
| … identical position (< 1 m) | 4,210 (100.00%) |
| … median / max position difference | 0.0 m / 0.0 m |
| Terminated postcodes in seed | 3,874 |
| … correctly absent from our live data | 3,874 (100.00%) |

## 2. Independent coordinate list (dwyl, October 2017)

| Area | In both | Only in 2017 list | Only in ours | Median diff | 95th pct | > 100 m | > 1 km |
|---|---|---|---|---|---|---|---|
| DY | 10,656 | 324 | 446 | 2.7 m | 39 m | 171 (1.60%) | 5 |
| SY | 13,923 | 297 | 717 | 2.7 m | 76 m | 589 (4.23%) | 21 |
| TF | 6,606 | 211 | 628 | 2.2 m | 45 m | 166 (2.51%) | 6 |
| WV | 10,047 | 294 | 440 | 2.3 m | 24 m | 113 (1.12%) | 5 |
| Rest of GB | 1,588,305 | 59,628 | 116,462 | 2.2 m | 33 m | 27,012 (1.70%) | 1,424 |

Largest differences in the detail areas: TF9 2LX (20293 m), WV6 7FA (9108 m), WV3 7LF (4293 m), TF6 5BQ (4256 m), SY11 3QN (4041 m), DY9 0WQ (3992 m), TF6 6EH (3456 m), SY6 7JE (2673 m), SY25 6NP (2430 m), TF6 6NH (1922 m)

## 3. District boundaries vs Wikipedia outlines

| Area | Postcode points inside own district: ours | … Wikipedia | Land area where both agree on the district |
|---|---|---|---|
| DY | 99.67% | 99.25% | 99.36% |
| SY | 99.21% | 99.22% | 99.22% |
| TF | 99.50% | 97.91% | 98.91% |
| WV | 98.84% | 90.52% | 99.06% |

