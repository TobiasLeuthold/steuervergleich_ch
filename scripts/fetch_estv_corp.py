"""Fetch profit and capital tax of companies per municipality from the ESTV.

Source: Eidgenössische Steuerverwaltung (ESTV), Steuerrechner, "Gewinn- und
Kapitalsteuern" https://swisstaxcalculator.estv.admin.ch

For every taxable capital option, canton and profit on the grid,
API_calculateManyLegalEntityTaxes returns the taxes of an ordinarily taxed
company (AG/GmbH, no participation relief, no patent box) for all
municipalities of the canton. The profit is entered as profit *before* taxes
(ProfitBeforeTaxes = true), so the calculator deducts the taxes themselves the
way the tax law does; the effective rate in the app is tax / profit before tax.

Raw rows are cached in data/raw/estv_corp_<year>.jsonl (resumable).

Usage: python3 scripts/fetch_estv_corp.py [--year 2026] [--workers 6]
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
    "lg-proxy/operation/c3b67379_ESTV/API_calculateManyLegalEntityTaxes"
)
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"

# ESTV canton ids (alphabetical order), same as fetch_estv.py
CANTONS = [
    "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE",
    "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
]

# taxable equity (share capital + reserves); share capital = min(capital, 100k)
CAPITALS = [20_000, 100_000, 500_000, 1_000_000, 5_000_000]


def profit_grid():
    """0-2M CHF profit before taxes."""
    grid = list(range(0, 200_000, 10_000))
    grid += list(range(200_000, 1_000_000, 50_000))
    grid += list(range(1_000_000, 2_000_001, 100_000))
    return grid


def payload(year, canton_idx, capital, profit):
    return {
        "SimKey": None,
        "TaxYear": year,
        "TaxGroupID": canton_idx,
        "ProfitBeforeTaxes": True,
        "TaxableProfitConf": profit,
        "TaxableProfitCanton": profit,
        "TaxableCapital": capital,
        "ShareCapital": min(capital, 100_000),
        "NetProfitParticipationConf": 0,
        "NetProfitParticipationCanton": 0,
        "TotalPatentBox": 0,
        "TotalAssets": 0,
        "TotalBeneficiaryParticipation": 0,
        "TotalBenificiaryParticipation": 0,  # sic, the ESTV frontend sends both
    }


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
            "fed": x["ProfitTaxFed"],
            "p_canton": x["ProfitTaxCanton"],
            "p_city": x["ProfitTaxCity"],
            "p_church": x["ProfitTaxChurch"],
            "c_canton": x["CapitalTaxCanton"],
            "c_city": x["CapitalTaxCity"],
            "c_church": x["CapitalTaxChurch"],
            "minimal": x["MinimalTaxesCanton"],
        }
        for x in rows
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_DIR / f"estv_corp_{args.year}.jsonl"
    done = set()
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            r = json.loads(line)
            done.add((r["capital"], r["canton"], r["profit"]))

    jobs = [
        (capital, canton, profit)
        for capital in CAPITALS
        for canton in CANTONS
        for profit in profit_grid()
        if (capital, canton, profit) not in done
    ]
    print(f"{len(done)} cached, {len(jobs)} to fetch")

    lock = threading.Lock()

    def run(job):
        capital, canton, profit = job
        body = payload(args.year, CANTONS.index(canton) + 1, capital, profit)
        rows = compact(fetch(body))
        return {"capital": capital, "canton": canton, "profit": profit, "rows": rows}

    with out_path.open("a") as f, ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(run, j) for j in jobs]
        for n, fut in enumerate(as_completed(futures), 1):
            rec = fut.result()
            with lock:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                f.flush()
            if n % 500 == 0:
                print(f"{n}/{len(jobs)}")
    print("done")


if __name__ == "__main__":
    main()
