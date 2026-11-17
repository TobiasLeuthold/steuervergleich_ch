"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CANTONS, type Meta } from "@/lib/data";
import { formatChf, formatPct } from "@/lib/format";
import { useLabels } from "@/lib/labels";

type Props = {
  meta: Meta;
  totals: number[];
  income: number;
  selectedBfs: number | null;
  onSelect: (bfs: number | null) => void;
  compare: Record<number, number>;
  onCompare: (bfs: number) => void;
  /** municipalities checked to be shown on the map; empty = all */
  mapFilter: Set<number>;
  onMapFilter: (next: Set<number>) => void;
};

type SortKey = "rank" | "name" | "canton";

export default function Ranking({
  meta,
  totals,
  income,
  selectedBfs,
  onSelect,
  compare,
  onCompare,
  mapFilter,
  onMapFilter,
}: Props) {
  const L = useLabels();
  const [query, setQuery] = useState("");
  const [onlyChecked, setOnlyChecked] = useState(false);
  const onlyCheckedActive = onlyChecked && mapFilter.size > 0;
  const [canton, setCanton] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "rank", asc: true });

  // rank 1 = lowest tax
  const ranked = useMemo(() => {
    const order = meta.munis.map((_, m) => m).sort((a, b) => totals[a] - totals[b]);
    const rank = new Array<number>(order.length);
    order.forEach((m, i) => (rank[m] = i + 1));
    return { order, rank };
  }, [meta, totals]);

  const cheapest = ranked.order[0];
  const priciest = ranked.order[ranked.order.length - 1];
  const median = totals[ranked.order[Math.floor(ranked.order.length / 2)]];
  const selected = selectedBfs === null ? -1 : meta.munis.findIndex((mu) => mu.bfs === selectedBfs);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ranked.order.filter(
      (m) =>
        (!canton || meta.munis[m].canton === canton) &&
        (!q || meta.munis[m].name.toLowerCase().includes(q)) &&
        (!onlyCheckedActive || mapFilter.has(meta.munis[m].bfs)),
    );
    const dir = sort.asc ? 1 : -1;
    if (sort.key === "name") list.sort((a, b) => dir * meta.munis[a].name.localeCompare(meta.munis[b].name, "de"));
    else if (sort.key === "canton")
      list.sort((a, b) => dir * (meta.munis[a].canton.localeCompare(meta.munis[b].canton) || totals[a] - totals[b]));
    else if (!sort.asc) list.reverse();
    return list;
  }, [ranked, query, canton, sort, meta, totals, onlyCheckedActive, mapFilter]);

  const checkedRows = rows.filter((m) => mapFilter.has(meta.munis[m].bfs)).length;
  const toggleOne = (bfs: number) => {
    const next = new Set(mapFilter);
    if (next.has(bfs)) next.delete(bfs);
    else next.add(bfs);
    onMapFilter(next);
  };
  // header checkbox: all rows currently listed (search / canton filter), not just the first 300
  const toggleListed = () => {
    const next = new Set(mapFilter);
    const all = checkedRows === rows.length;
    for (const m of rows) {
      if (all) next.delete(meta.munis[m].bfs);
      else next.add(meta.munis[m].bfs);
    }
    onMapFilter(next);
  };

  const rate = (v: number) => (income > 0 ? formatPct((v / income) * 100) : "–");
  const head = (key: SortKey, label: string, className?: string) => (
    <th
      className={className}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"}
    >
      {label} {sort.key === key ? (sort.asc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <>
      <div className="stats" style={{ marginTop: 20 }}>
        <Stat label="Tiefste Steuer" m={cheapest} meta={meta} totals={totals} rate={rate} />
        <Stat label="Höchste Steuer" m={priciest} meta={meta} totals={totals} rate={rate} />
        <div className="stat">
          <div className="stat-label">Median aller Gemeinden</div>
          <div className="stat-value">{formatChf(median)}</div>
          <div className="stat-sub">{rate(median)} {L.share}</div>
        </div>
        {selected >= 0 && (
          <Stat
            label={`Ausgewählt · Rang ${ranked.rank[selected]} von ${meta.munis.length}`}
            m={selected}
            meta={meta}
            totals={totals}
            rate={rate}
            action={
              compare[meta.munis[selected].bfs] ? (
                <span className="muted">im Gemeindevergleich</span>
              ) : (
                <button className="link-button" onClick={() => onCompare(meta.munis[selected].bfs)}>
                  + Vergleich
                </button>
              )
            }
          />
        )}
      </div>

      <div className="ranking-head">
        <strong>Rangliste</strong>
        <input
          type="search"
          placeholder="Gemeinde suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Gemeinde suchen"
        />
        <select value={canton} onChange={(e) => setCanton(e.target.value)} aria-label="Kanton filtern">
          <option value="">Alle Kantone</option>
          {CANTONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="muted">{rows.length} Gemeinden</span>
      </div>
      <p className="chart-note">
        {mapFilter.size === 0 ? (
          <>Häkchen setzen, um nur diese Gemeinden auf der Karte farbig zu zeigen (Kopfzeile: alle gelisteten).</>
        ) : (
          <>
            <strong style={{ color: "var(--text-primary)" }}>{mapFilter.size}</strong> Gemeinden auf der Karte
            ausgewählt ·{" "}
            <label style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={onlyChecked} onChange={(e) => setOnlyChecked(e.target.checked)} /> nur
              Auswahl in der Liste
            </label>{" "}
            ·{" "}
            <button className="link-button" onClick={() => onMapFilter(new Set())}>
              Auswahl aufheben
            </button>
          </>
        )}
      </p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th className="check" onClick={(e) => e.stopPropagation()}>
                <TriCheckbox
                  checked={rows.length > 0 && checkedRows === rows.length}
                  indeterminate={checkedRows > 0 && checkedRows < rows.length}
                  onChange={toggleListed}
                  label="Alle gelisteten Gemeinden auf der Karte auswählen"
                />
              </th>
              {head("rank", "Rang", "num")}
              {head("name", "Gemeinde")}
              {head("canton", "Kanton")}
              <th className="num">Steuer pro Jahr</th>
              <th className="num">{L.share}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((m) => (
              <tr
                key={m}
                onClick={() => onSelect(meta.munis[m].bfs === selectedBfs ? null : meta.munis[m].bfs)}
                style={{ cursor: "pointer", fontWeight: m === selected ? 600 : undefined }}
              >
                <td className="check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={mapFilter.has(meta.munis[m].bfs)}
                    onChange={() => toggleOne(meta.munis[m].bfs)}
                    aria-label={`${meta.munis[m].name} auf der Karte zeigen`}
                  />
                </td>
                <td className="num">{ranked.rank[m]}</td>
                <td>{meta.munis[m].name}</td>
                <td>{meta.munis[m].canton}</td>
                <td className="num">{formatChf(totals[m])}</td>
                <td className="num">{rate(totals[m])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 300 && (
        <p className="chart-note" style={{ marginTop: 6 }}>
          Die ersten 300 von {rows.length} angezeigt. Suche oder Kantonsfilter verwenden.
        </p>
      )}
    </>
  );
}

function Stat({
  label,
  m,
  meta,
  totals,
  rate,
  action,
}: {
  action?: React.ReactNode;
  label: string;
  m: number;
  meta: Meta;
  totals: number[];
  rate: (v: number) => string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{formatChf(totals[m])}</div>
      <div className="stat-sub">
        {meta.munis[m].name} ({meta.munis[m].canton}) · {rate(totals[m])}
      </div>
      {action && <div style={{ marginTop: 4, fontSize: "0.82rem" }}>{action}</div>}
    </div>
  );
}

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} title={label} />;
}
