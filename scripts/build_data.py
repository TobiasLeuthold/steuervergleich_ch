"""Turn the raw ESTV rows into the compact files the web app loads.

Input:  data/raw/estv_<year>.jsonl (scripts/fetch_estv.py)
Output: public/data/meta.json           year, income grid, municipalities
        public/data/taxes_<profile>.json per municipality and income point:
            base   total tax without confession (federal + cantonal + communal
                   + personal tax - tax credit)
            canton cantonal income tax
            ref    extra tax as reformed (church tax; in SO also personal tax)
            cat    extra tax as roman catholic
          plus fed: federal tax per income point (same in every municipality)

Usage: python3 scripts/build_data.py [--year 2026]
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2026)
    args = ap.parse_args()

    raw = ROOT / "data" / "raw" / f"estv_{args.year}.jsonl"
    # (profile, conf, income) -> bfs -> row ; a municipality with several tax
    # locations (e.g. school districts) keeps the mean of its locations
    rows = defaultdict(lambda: defaultdict(list))
    names, cantons, incomes, profiles = {}, {}, set(), set()
    for line in raw.read_text().splitlines():
        rec = json.loads(line)
        incomes.add(rec["income"])
        profiles.add(rec["profile"])
        for r in rec["rows"]:
            rows[(rec["profile"], rec["conf"], rec["income"])][r["bfs"]].append(r)
            names[r["bfs"]] = r["name"]
            cantons[r["bfs"]] = rec["canton"]

    incomes = sorted(incomes)
    munis = sorted(names, key=lambda b: (cantons[b], names[b]))
    multi = {b for k in rows for b, rs in rows[k].items() if len(rs) > 1}
    if multi:
        print(f"{len(multi)} municipalities with several tax locations (averaged)")

    def mean(rs, f):
        return round(sum(f(r) for r in rs) / len(rs))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta = {
        "year": args.year,
        "source": "ESTV Steuerrechner (swisstaxcalculator.estv.admin.ch)",
        "incomes": incomes,
        "munis": [{"bfs": b, "name": names[b], "canton": cantons[b]} for b in munis],
    }
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))

    for profile in sorted(profiles):
        base, canton, ref, cat = ([[] for _ in munis] for _ in range(4))
        fed = []
        for inc in incomes:
            none_rows = rows[(profile, "none", inc)]
            ref_rows = rows[(profile, "ref", inc)]
            cat_rows = rows[(profile, "cat", inc)]
            feds = {r["fed"] for rs in none_rows.values() for r in rs}
            if len(feds) > 1:
                print(f"warning: federal tax differs across municipalities ({profile}, {inc}): {sorted(feds)[:5]}")
            fed.append(max(feds) if feds else 0)
            for idx, b in enumerate(munis):
                nr, rr, cr = none_rows.get(b), ref_rows.get(b), cat_rows.get(b)
                if not nr or not rr or not cr:
                    raise SystemExit(f"missing data: {profile} {inc} bfs {b}")
                total = mean(nr, lambda r: r["total"])
                base[idx].append(total)
                canton[idx].append(mean(nr, lambda r: r["canton"]))
                ref[idx].append(mean(rr, lambda r: r["total"]) - total)
                cat[idx].append(mean(cr, lambda r: r["total"]) - total)
        out = {"profile": profile, "fed": fed, "base": base, "canton": canton, "ref": ref, "cat": cat}
        path = OUT_DIR / f"taxes_{profile}.json"
        path.write_text(json.dumps(out, separators=(",", ":")))
        print(f"{path.name}: {len(munis)} municipalities x {len(incomes)} incomes, {path.stat().st_size / 1e6:.1f} MB")

    corp = build_corp(args.year, munis)
    if corp:
        meta["corp"] = corp
        (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))


def build_corp(year, munis):
    """Company taxes (scripts/fetch_estv_corp.py) in the municipality order of
    meta.json. Per capital option one file taxes_corp_<capital>.json:
        base   total profit + capital tax (federal, cantonal, communal, church
               where the canton levies it on companies, cantonal minimum tax)
        fed    federal profit tax per municipality (the deductible cantonal
               taxes differ, so it differs slightly by municipality)
        canton cantonal profit + capital tax
    Returns the meta entry {profits, capitals} or None without raw data."""
    raw = ROOT / "data" / "raw" / f"estv_corp_{year}.jsonl"
    if not raw.exists():
        print(f"{raw.name} missing, skipping company taxes")
        return None
    rows = defaultdict(lambda: defaultdict(list))
    profits, capitals = set(), set()
    for line in raw.read_text().splitlines():
        rec = json.loads(line)
        profits.add(rec["profit"])
        capitals.add(rec["capital"])
        for r in rec["rows"]:
            rows[(rec["capital"], rec["profit"])][r["bfs"]].append(r)
    profits, capitals = sorted(profits), sorted(capitals)

    def mean(rs, f):
        return round(sum(f(r) for r in rs) / len(rs))

    def total(r):
        return (
            r["fed"] + r["p_canton"] + r["p_city"] + r["p_church"]
            + r["c_canton"] + r["c_city"] + r["c_church"] + r["minimal"]
        )

    missing = set()
    for capital in capitals:
        base, fed, canton = ([[] for _ in munis] for _ in range(3))
        for p in profits:
            by_bfs = rows[(capital, p)]
            for idx, b in enumerate(munis):
                rs = by_bfs.get(b)
                if not rs:
                    # no company tax location for this municipality: no data
                    missing.add(b)
                    base[idx].append(None)
                    fed[idx].append(None)
                    canton[idx].append(None)
                    continue
                base[idx].append(mean(rs, total))
                fed[idx].append(mean(rs, lambda r: r["fed"]))
                canton[idx].append(mean(rs, lambda r: r["c_canton"] + r["p_canton"]))
        out = {"capital": capital, "fed": fed, "base": base, "canton": canton}
        path = OUT_DIR / f"taxes_corp_{capital}.json"
        path.write_text(json.dumps(out, separators=(",", ":")))
        print(f"{path.name}: {len(munis)} municipalities x {len(profits)} profits, {path.stat().st_size / 1e6:.1f} MB")
    if missing:
        print(f"warning: {len(missing)} municipalities without company tax data: {sorted(missing)[:10]}")
    church = sum(1 for k in rows for rs in rows[k].values() for r in rs if r["p_church"] or r["c_church"])
    minimal = sum(1 for k in rows for rs in rows[k].values() for r in rs if r["minimal"])
    print(f"rows with church tax: {church}, with minimum tax: {minimal}")
    return {"profits": profits, "capitals": capitals}


if __name__ == "__main__":
    main()
