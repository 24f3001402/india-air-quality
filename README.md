# India Air Quality

A dashboard of PM2.5 readings for ten Indian cities that keeps itself up to date.
A scheduled workflow pulls fresh readings every morning, commits them, and GitHub
Pages redeploys — so the page always shows current data without anyone touching it.

**Live:** https://24f3001402.github.io/india-air-quality/

## How it works

```
.github/workflows/update-data.yml   daily cron -> run the fetch -> commit if changed
scripts/fetch_data.py               pull readings, roll them into daily means
scripts/backfill.py                 seed history from the archive
data/latest.json                    most recent reading per city
data/history.json                   rolling 90 days of daily means
index.html, css/, js/               the dashboard itself
```

The workflow runs at 01:30 UTC (07:00 IST). It commits only when the data actually
changed, so the history stays meaningful rather than filling up with empty commits.

Readings come from the [Open-Meteo air quality API](https://open-meteo.com/), which
needs no API key — so the workflow runs with no secrets configured.

## The dashboard

- Headline figures: worst city right now, the ten-city average, the cleanest city,
  and how many sit above the WHO 24-hour guideline of 15 µg/m³
- A per-city bar chart of the current reading, banded by air quality
- Ninety days of daily averages as one panel per city, on a shared vertical scale
  so the panels compare directly
- A table view with every value, and a 30/90 day range filter

Bands follow simplified CPCB breakpoints for PM2.5: good ≤30, moderate 30–60,
poor 60–120, severe >120 µg/m³. Colour never carries a band on its own — the band
name is always printed beside the value, and the table view has every number.

The chart colours are checked against a colour-vision-deficiency simulation for both
light and dark themes, so adjacent bands stay distinguishable.

## Running locally

Python 3 and any static server — there are no dependencies to install.

```sh
python3 scripts/fetch_data.py       # refresh data/
python3 -m http.server 8000         # then open http://localhost:8000
```

To rebuild history over a longer window:

```sh
python3 scripts/backfill.py 2026-05-25 2026-08-23
```

## Cities

Delhi, Mumbai, Bengaluru, Kolkata, Chennai, Hyderabad, Ahmedabad, Pune, Jaipur,
and Lucknow.

## License

MIT — see [LICENSE](LICENSE).
