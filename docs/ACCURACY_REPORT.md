# Accuracy report (generated)

Generated 2026-10-28 by `npm run data:crosscheck` for: ONSPD February 2026 (as stated by uk-address-lookup 0.1.0). See docs/ACCURACY.md for how to read it.

## 1. Official ONSPD rows from the postcodes.io database (test seed)

| Check | Result |
|---|---|
| Live postcodes in seed | 4,210 |
| … present in our data | 4,197 (99.69%) |
| … identical position (< 1 m) | 4,010 (95.54%) |
| … median / max position difference | 0.0 m / 1785 m |
| Terminated postcodes in seed | 3,874 |
| … correctly absent from our live data | 3,866 (99.79%) |

Live in the seed but not in our data (likely terminated after the seed was made): AB15 8RG, AB15 8RU, AB16 9GA, AB12 9HH, AB12 9HJ, AB12 9HL, AB11 5FG, AB16 9FY, AB16 9FZ, AB12 5AG, AB12 5EF, AB12 5EG, AB12 5EH

## 2. Independent coordinate list (dwyl, October 2017)

| Area | In both | Only in 2017 list | Only in ours | Median diff | 95th pct | > 100 m | > 1 km |
|---|---|---|---|---|---|---|---|
| DY | 10,675 | 305 | 436 | 2.7 m | 36 m | 154 (1.44%) | 4 |
| SY | 13,929 | 291 | 689 | 2.7 m | 72 m | 558 (4.01%) | 16 |
| TF | 6,608 | 209 | 612 | 2.1 m | 42 m | 149 (2.25%) | 6 |
| WV | 10,062 | 279 | 427 | 2.2 m | 23 m | 110 (1.09%) | 3 |
| Rest of GB | 1,589,819 | 58,114 | 112,428 | 2.2 m | 32 m | 25,569 (1.61%) | 1,364 |

Largest differences in the detail areas: TF9 2LX (20374 m), WV6 7FA (9108 m), WV3 7LF (4293 m), TF6 5BQ (4247 m), SY11 3QN (4041 m), DY9 0WQ (3992 m), TF6 6EH (3456 m), SY6 7JE (2673 m), SY25 6NP (2430 m), TF6 6NH (1922 m)

## 3. District boundaries vs Wikipedia outlines

| Area | Postcode points inside own district: ours | … Wikipedia | Land area where both agree on the district |
|---|---|---|---|
| DY | 99.67% | 99.23% | 99.38% |
| SY | 99.20% | 99.25% | 99.30% |
| TF | 99.49% | 97.94% | 98.96% |
| WV | 98.84% | 90.54% | 99.23% |

