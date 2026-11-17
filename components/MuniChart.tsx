"use client";

import { useMemo, useState } from "react";
import { totalAt, type Church, type Meta, type Taxes } from "@/lib/data";
import { formatChf, formatPct } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import RateChart from "./RateChart";

export const MAX_COMPARE = 8; // one categorical slot per municipality
// table columns; only those on the grid of the shown data are used
const TABLE_INCOMES = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000, 1_000_000, 2_000_000];

type Props = {
  meta: Meta;
  taxes: Taxes;
  church: Church;
  income: number;
  /** bfs -> categorical slot (1-8) */
  compare: Record<number, number>;
  onAdd: (bfs: number) => void;
  onRemove: (bfs: number) => void;
};

const shortName = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name);

export default function MuniChart({ meta, taxes, church, income, compare, onAdd, onRemove }: Props) {
  const L = useLabels();
  const [query, setQuery] = useState("");
  const [showTable, setShowTable] = useState(false);

  const index = useMemo(() => new Map(meta.munis.map((mu, i) => [mu.bfs, i])), [meta]);
  const chosen = Object.keys(compare)
    .map(Number)
    .filter((bfs) => index.has(bfs))
    .sort((a, b) => compare[a] - compare[b]);
  const full = chosen.length >= MAX_COMPARE;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return meta.munis
      .filter((mu) => !compare[mu.bfs] && mu.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name, "de"))
      .slice(0, 8);
  }, [query, meta, compare]);

  const add = (bfs: number) => {
    onAdd(bfs);
    setQuery("");
  };

  const series = useMemo(
    () =>
      chosen.map((bfs) => {
        const m = index.get(bfs)!;
        const totals = meta.incomes.map((_, g) => totalAt(taxes, church, m, g));
        return {
          bfs,
          m,
          totals,
          rates: totals.map((t, g) => (meta.incomes[g] > 0 ? (t / meta.incomes[g]) * 100 : 0)),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, taxes, church, index, chosen.join()],
  );

  const color = (bfs: number) => `var(--series-${compare[bfs]})`;
  const label = (m: number) => `${meta.munis[m].name} (${meta.munis[m].canton})`;

  const tooltip = (g: number) => (
    <>
      <div className="tooltip-title">
        {L.amount} {formatChf(meta.incomes[g])}
      </div>
      <table>
        <tbody>
          {[...series]
            .sort((a, b) => b.totals[g] - a.totals[g])
            .map((s) => (
              <tr key={s.bfs}>
                <td>
                  <span className="legend-swatch" style={{ background: color(s.bfs) }} />
                  {label(s.m)}
                </td>
                <td className="num">{formatPct(s.rates[g])}</td>
                <td className="num muted">{formatChf(s.totals[g])}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );

  return (
    <div>
      <div className="chips" role="group" aria-label="Gewählte Gemeinden">
        {chosen.map((bfs) => {
          const m = index.get(bfs)!;
          return (
            <button
              key={bfs}
              className="chip"
              aria-pressed="true"
              title={`${label(m)} entfernen`}
              onClick={() => onRemove(bfs)}
            >
              <span className="chip-dot" style={{ background: color(bfs), borderColor: color(bfs) }} />
              {label(m)} <span aria-hidden="true">×</span>
            </button>
          );
        })}
      </div>

      <div className="muni-picker">
        <input
          type="search"
          placeholder={full ? `Maximal ${MAX_COMPARE} Gemeinden` : "Gemeinde hinzufügen …"}
          value={query}
          disabled={full}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) add(matches[0].bfs);
            if (e.key === "Escape") setQuery("");
          }}
          aria-label="Gemeinde zum Vergleich hinzufügen"
        />
        {matches.length > 0 && (
          <ul className="muni-options" role="listbox">
            {matches.map((mu) => (
              <li key={mu.bfs}>
                <button onClick={() => add(mu.bfs)}>
                  {mu.name} <span className="muted">({mu.canton})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="chart-note">
        Max. {MAX_COMPARE} Gemeinden gleichzeitig ({chosen.length} gewählt). Auch über die Karte: Gemeinde
        anklicken, dann «+ Vergleich».
        {chosen.length > 0 && (
          <>
            {" · "}
            <button className="link-button" onClick={() => chosen.forEach(onRemove)}>
              alle entfernen
            </button>
          </>
        )}
      </p>

      <RateChart
        incomes={meta.incomes}
        income={income}
        labelWidth={130}
        series={series.map((s) => ({
          key: String(s.bfs),
          label: shortName(meta.munis[s.m].name),
          color: color(s.bfs),
          line: s.rates,
        }))}
        tooltip={tooltip}
        ariaLabel={`Liniendiagramm: Steuerbelastung in Prozent (${L.amount}) bis ${formatChf(meta.incomes[meta.incomes.length - 1])} für die gewählten Gemeinden`}
      />

      {chosen.length === 0 && <p className="muted">Fügen Sie oben mindestens eine Gemeinde hinzu.</p>}

      <button className="link-button" onClick={() => setShowTable((v) => !v)} style={{ marginTop: 8 }}>
        {showTable ? "Tabelle ausblenden" : "Als Tabelle anzeigen"}
      </button>
      {showTable && series.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Gemeinde</th>
                {TABLE_INCOMES.filter((inc) => meta.incomes.includes(inc)).map((inc) => (
                  <th key={inc} className="num">
                    {formatChf(inc)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.bfs}>
                  <td>{label(s.m)}</td>
                  {TABLE_INCOMES.filter((inc) => meta.incomes.includes(inc)).map((inc) => {
                    const g = meta.incomes.indexOf(inc);
                    return (
                      <td key={inc} className="num">
                        {formatChf(s.totals[g])} <span className="muted">{formatPct(s.rates[g])}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
