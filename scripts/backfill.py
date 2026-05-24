"""Seed data/history.json from the archive so the dashboard opens with context.

The daily workflow only ever sees a short window, so a fresh checkout would show
a nearly empty chart. This pulls a longer stretch of real readings in one go.

    python3 scripts/backfill.py 2026-05-25 2026-08-23
"""

import json
import os
import sys
import urllib.parse
import urllib.request

from fetch_data import API, CITIES, DATA, daily_means


def fetch_range(start, end):
    query = urllib.parse.urlencode({
        "latitude": ",".join(str(c["lat"]) for c in CITIES),
        "longitude": ",".join(str(c["lon"]) for c in CITIES),
        "hourly": "pm2_5",
        "start_date": start,
        "end_date": end,
        "timezone": "Asia/Kolkata",
    })
    req = urllib.request.Request(
        API + "?" + query,
        headers={"User-Agent": "india-air-quality-dashboard"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)
    return payload if isinstance(payload, list) else [payload]


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: backfill.py <start YYYY-MM-DD> <end YYYY-MM-DD>")

    start, end = sys.argv[1], sys.argv[2]
    responses = fetch_range(start, end)

    cities = {}
    for city, resp in zip(CITIES, responses):
        cities[city["name"]] = dict(sorted(daily_means(resp["hourly"], "pm2_5").items()))

    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "history.json"), "w") as fh:
        json.dump({
            "updated": end + "T23:59:59+05:30",
            "days": 90,
            "metric": "pm2_5",
            "unit": "ug/m3",
            "cities": cities,
        }, fh, indent=1, sort_keys=True)
        fh.write("\n")

    span = sorted({d for v in cities.values() for d in v})
    print(f"{len(cities)} cities, {len(span)} days ({span[0]} to {span[-1]})")


if __name__ == "__main__":
    main()
