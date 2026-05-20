"""Pull air quality readings for a set of Indian cities and update the data files.

Uses the Open-Meteo air quality API, which needs no API key. Only the standard
library is used so the scheduled workflow has nothing to install.
"""

import json
import os
import statistics
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

API = "https://air-quality-api.open-meteo.com/v1/air-quality"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# Keeping roughly three months of daily means keeps history.json small enough
# to sit in the repo and load instantly in the browser.
HISTORY_DAYS = 90

CITIES = [
    {"name": "Delhi",     "lat": 28.6139, "lon": 77.2090},
    {"name": "Mumbai",    "lat": 19.0760, "lon": 72.8777},
    {"name": "Bengaluru", "lat": 12.9716, "lon": 77.5946},
    {"name": "Kolkata",   "lat": 22.5726, "lon": 88.3639},
    {"name": "Chennai",   "lat": 13.0827, "lon": 80.2707},
    {"name": "Hyderabad", "lat": 17.3850, "lon": 78.4867},
    {"name": "Ahmedabad", "lat": 23.0225, "lon": 72.5714},
    {"name": "Pune",      "lat": 18.5204, "lon": 73.8567},
    {"name": "Jaipur",    "lat": 26.9124, "lon": 75.7873},
    {"name": "Lucknow",   "lat": 26.8467, "lon": 80.9462},
]

POLLUTANTS = ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"]


def fetch():
    """One request for every city — the API takes comma separated coordinates."""
    query = urllib.parse.urlencode({
        "latitude": ",".join(str(c["lat"]) for c in CITIES),
        "longitude": ",".join(str(c["lon"]) for c in CITIES),
        "hourly": ",".join(POLLUTANTS),
        "past_days": 7,
        "forecast_days": 1,
        "timezone": "Asia/Kolkata",
    })
    req = urllib.request.Request(
        API + "?" + query,
        headers={"User-Agent": "india-air-quality-dashboard"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.load(resp)

    # A single coordinate returns an object, several return a list.
    return payload if isinstance(payload, list) else [payload]


def daily_means(hourly, key):
    """Collapse hourly readings into a mean per calendar day."""
    buckets = {}
    for stamp, value in zip(hourly["time"], hourly.get(key) or []):
        if value is None:
            continue
        buckets.setdefault(stamp[:10], []).append(value)
    return {day: round(statistics.fmean(vals), 1) for day, vals in buckets.items()}


def latest_reading(hourly, key, now_hour):
    """Most recent hourly value at or before the current hour."""
    values = hourly.get(key) or []
    best = None
    for stamp, value in zip(hourly["time"], values):
        if value is None or stamp > now_hour:
            continue
        best = (stamp, value)
    return best


def load_history():
    path = os.path.join(DATA, "history.json")
    if not os.path.exists(path):
        return {}
    with open(path) as fh:
        raw = json.load(fh)
    return raw.get("cities", {})


def main():
    responses = fetch()
    if len(responses) != len(CITIES):
        raise SystemExit(
            f"expected {len(CITIES)} results, got {len(responses)}"
        )

    now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    now_hour = now.strftime("%Y-%m-%dT%H:00")
    cutoff = (now.date() - timedelta(days=HISTORY_DAYS)).isoformat()

    history = load_history()
    latest = []

    for city, resp in zip(CITIES, responses):
        hourly = resp["hourly"]

        # merge today's window into whatever the previous runs recorded
        series = history.setdefault(city["name"], {})
        for day, value in daily_means(hourly, "pm2_5").items():
            if day >= cutoff:
                series[day] = value
        for day in [d for d in series if d < cutoff]:
            del series[day]

        current = {"city": city["name"], "lat": city["lat"], "lon": city["lon"]}
        for key in POLLUTANTS:
            reading = latest_reading(hourly, key, now_hour)
            current[key] = None if reading is None else round(reading[1], 1)
            if key == "pm2_5" and reading is not None:
                current["observed"] = reading[0]
        latest.append(current)

    os.makedirs(DATA, exist_ok=True)

    with open(os.path.join(DATA, "latest.json"), "w") as fh:
        json.dump({
            "updated": now.isoformat(timespec="seconds"),
            "source": "Open-Meteo air quality API",
            "cities": latest,
        }, fh, indent=1, sort_keys=True)
        fh.write("\n")

    with open(os.path.join(DATA, "history.json"), "w") as fh:
        json.dump({
            "updated": now.isoformat(timespec="seconds"),
            "days": HISTORY_DAYS,
            "metric": "pm2_5",
            "unit": "ug/m3",
            "cities": {k: dict(sorted(v.items())) for k, v in sorted(history.items())},
        }, fh, indent=1, sort_keys=True)
        fh.write("\n")

    span = sorted({d for v in history.values() for d in v})
    print(f"{len(latest)} cities, {len(span)} days ({span[0]} to {span[-1]})")


if __name__ == "__main__":
    main()
