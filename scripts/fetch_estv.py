"""Fetch income tax per municipality from the ESTV tax calculator.

Source: Eidgenössische Steuerverwaltung (ESTV), Steuerrechner
https://swisstaxcalculator.estv.admin.ch

For every household profile, confession, canton and gross income on the grid,
API_calculateManySimpleTaxes returns the taxes for all municipalities of the
canton (gross salary -> social contributions and standard deductions are
applied by the ESTV calculator). Raw rows are cached in data/raw/*.jsonl so an
interrupted run resumes where it stopped.

Usage: python3 scripts/fetch_estv.py [--year 2026] [--workers 6]
Then: python3 scripts/build_data.py
"""

import argparse
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

API = (
    "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/"
    "lg-proxy/operation/c3b67379_ESTV/API_calculateManySimpleTaxes"
)
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"

# ESTV canton ids (alphabetical order)
CANTONS = [
    "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE",
    "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
]

# ESTV confession ids: 4 no confession, 1 reformed, 2 roman catholic.
# The church tax is the difference to the run without confession (not just
# IncomeTaxChurch: e.g. SO's personal tax also depends on the confession).
CONFESSIONS = {"none": 4, "ref": 1, "cat": 2}

PROFILES = {
    "single": {"Relationship": 1, "Age1": 35, "Children": [], "married": False},
    "married": {"Relationship": 2, "Age1": 40, "Children": [], "married": True},
    "family": {
        "Relationship": 2,
        "Age1": 40,
        "Children": [{"Age": 8}, {"Age": 10}],
        "married": True,
    },
}


def income_grid():
    """0-1M CHF, denser where the tariff curves bend most."""
    grid = list(range(0, 200_000, 5_000))
    grid += list(range(200_000, 400_000, 10_000))
    grid += list(range(400_000, 1_000_001, 25_000))
    return grid


def payload(year, canton_idx, profile, confession, income):
    p = PROFILES[profile]
    body = {
        "SimKey": None,
        "TaxYear": year,
        "TaxGroupID": canton_idx,
        "Relationship": p["Relationship"],
        "Confession1": confession,
        "Children": p["Children"],
        "Age1": p["Age1"],
        "RevenueType1": 1,  # employed, gross salary
        "Revenue1": income,
        "Fortune": 0,
        "Confession2": 0,
        "Age2": 0,
        "RevenueType2": 0,
        "Revenue2": 0,
    }
    if p["married"]:
        # single-earner couple: partner has no income
        body.update({"Confession2": confession, "Age2": p["Age1"]})
    return body


session = requests.Session()


def fetch(body, attempts=5):
    for i in range(attempts):
        try:
            r = session.post(API, json=body, timeout=60)
            r.raise_for_status()
            return r.json()["response"]
        except Exception as e:  # noqa: BLE001 - retry any network/API error
            if i == attempts - 1:
                raise
            time.sleep(2 ** i)
            print(f"retry {i + 1}: {e}")


def compact(rows):
    return [
        {
            "bfs": x["Location"]["BfsID"],
            "name": x["Location"]["BfsName"] or x["Location"]["City"],
            "loc": x["Location"]["TaxLocationID"],
            "fed": x["IncomeTaxFed"],
            "canton": x["IncomeTaxCanton"],
            "city": x["IncomeTaxCity"],
            "church": x["IncomeTaxChurch"],
            "personal": x["PersonalTax"],
            "credit": x["TaxCredit"],
            "total": x["TotalNetTax"],
        }
        for x in rows
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_DIR / f"estv_{args.year}.jsonl"
    done = set()
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            r = json.loads(line)
            done.add((r["profile"], r["conf"], r["canton"], r["income"]))

    jobs = [
        (profile, conf, canton, income)
        for profile in PROFILES
        for conf in CONFESSIONS
        for canton in CANTONS
        for income in income_grid()
        if (profile, conf, canton, income) not in done
    ]
    print(f"{len(done)} cached, {len(jobs)} to fetch")

    lock = threading.Lock()

    def run(job):
        profile, conf, canton, income = job
        body = payload(args.year, CANTONS.index(canton) + 1, profile, CONFESSIONS[conf], income)
        rows = compact(fetch(body))
        return {"profile": profile, "conf": conf, "canton": canton, "income": income, "rows": rows}

    with out_path.open("a") as f, ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(run, j) for j in jobs]
        for n, fut in enumerate(as_completed(futures), 1):
            rec = fut.result()
            with lock:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                f.flush()
            if n % 200 == 0:
                print(f"{n}/{len(jobs)}")
    print("done")


if __name__ == "__main__":
    main()
