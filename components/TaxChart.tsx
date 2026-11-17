"use client";

import { useMemo, useState } from "react";
import { CANTONS, cantonSeries, type CantonSeries, type Church, type Meta, type Taxes } from "@/lib/data";
import { formatChf, formatPct } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import RateChart from "./RateChart";

const MAX_SELECTED = 8; // one categorical slot per canton, never more than 8 hues
// table columns; only those on the grid of the shown data are used
const TABLE_INCOMES = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000, 1_000_000, 2_000_000];

type Props = { meta: Meta; taxes: Taxes; church: Church; income: number };

export default function TaxChart({ meta, taxes, church, income }: Props) {
  // canton code -> categorical slot (1-8); a canton keeps its slot while selected
  const [slots, setSlots] = useState<Record<string, number>>({ ZH: 1, ZG: 2, GE: 3, BE: 4 });
  const L = useLabels();
  const [showTable, setShowTable] = useState(false);

  const selected = CANTONS.filter((c) => slots[c.code]);
  const full = selected.length >= MAX_SELECTED;

  const toggle = (code: string) =>
    setSlots((s) => {
      const next = { ...s };
      if (next[code]) {
        delete next[code];
        return next;
      }
      const used = new Set(Object.values(next));
      const free = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !used.has(n));
      if (free) next[code] = free;
      return next;
    });

  const series = useMemo(
    () => selected.map((c) => cantonSeries(meta, taxes, church, c.code)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, taxes, church, selected.map((c) => c.code).join()],
  );

  const color = (code: string) => `var(--series-${slots[code]})`;
  const nameOf = (m: number) => meta.munis[m]?.name ?? "";

  const tooltip = (g: number) => (
    <>
      <div className="tooltip-title">
        {L.amount} {formatChf(meta.incomes[g])}
      </div>
      <table>
        <tbody>
          {[...series]
            .sort((a, b) => b.avg[g] - a.avg[g])
            .map((s) => (
              <tr key={s.code}>
                <td style={{ paddingTop: 4 }}>
                  <span className="legend-swatch" style={{ background: color(s.code) }} />
                  <strong>{s.code}</strong> Ø
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    {nameOf(s.min[g].muni)} {formatPct(s.min[g].rate)} – {nameOf(s.max[g].muni)} {formatPct(s.max[g].rate)}
                  </div>
                </td>
                <td className="num" style={{ verticalAlign: "top", paddingTop: 4 }}>
                  {formatPct(s.avg[g])}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );

  return (
    <div>
      <div className="chips" role="group" aria-label="Kantone anzeigen">
        {CANTONS.map((c) => {
          const on = Boolean(slots[c.code]);
          return (
            <button
              key={c.code}
              className="chip"
              aria-pressed={on}
              disabled={!on && full}
              title={!on && full ? `Maximal ${MAX_SELECTED} Kantone gleichzeitig` : c.name}
              onClick={() => toggle(c.code)}
            >
              <span className="chip-dot" style={{ background: on ? color(c.code) : "transparent", borderColor: on ? color(c.code) : undefined }} />
              {c.code}
            </button>
          );
        })}
      </div>
      <p className="chart-note">
        <span className="line-key">
          <svg width="26" height="8" aria-hidden="true">
            <line x1="0" x2="26" y1="4" y2="4" stroke="var(--text-secondary)" strokeWidth="2" />
          </svg>
          Ø Gemeinden des Kantons
        </span>
        <span className="line-key">
          <svg width="26" height="8" aria-hidden="true">
            <line x1="0" x2="26" y1="4" y2="4" stroke="var(--text-secondary)" strokeWidth="1.25" strokeDasharray="4 3" />
          </svg>
          tiefste / höchste Gemeinde
        </span>
        Max. {MAX_SELECTED} Kantone gleichzeitig ({selected.length} gewählt)
        {selected.length > 0 && (
          <>
            {" · "}
            <button className="link-button" onClick={() => setSlots({})}>
              alle abwählen
            </button>
          </>
        )}
      </p>

      <RateChart
        incomes={meta.incomes}
        income={income}
        series={series.map((s) => ({
          key: s.code,
          label: s.code,
          color: color(s.code),
          line: s.avg,
          lower: s.min.map((p) => p.rate),
          upper: s.max.map((p) => p.rate),
        }))}
        tooltip={tooltip}
        ariaLabel={`Liniendiagramm: Steuerbelastung in Prozent (${L.amount}) bis ${formatChf(meta.incomes[meta.incomes.length - 1])} für die gewählten Kantone`}
      />

      {selected.length === 0 && <p className="muted">Wählen Sie oben mindestens einen Kanton.</p>}

      <button className="link-button" onClick={() => setShowTable((v) => !v)} style={{ marginTop: 8 }}>
        {showTable ? "Tabelle ausblenden" : "Als Tabelle anzeigen"}
      </button>
      {showTable && series.length > 0 && <SeriesTable meta={meta} series={series} />}
    </div>
  );
}

function SeriesTable({ meta, series }: { meta: Meta; series: CantonSeries[] }) {
  const cols = TABLE_INCOMES.map((inc) => meta.incomes.indexOf(inc)).filter((g) => g >= 0);
  const name = (m: number) => meta.munis[m].name;
  return (
    <div className="table-scroll" style={{ marginTop: 10 }}>
      <table className="data">
        <thead>
          <tr>
            <th>Kanton</th>
            <th />
            {cols.map((g) => (
              <th key={g} className="num">
                {formatChf(meta.incomes[g])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.flatMap((s) => [
            <tr key={`${s.code}-avg`}>
              <td rowSpan={3}>
                <strong>{s.code}</strong>
              </td>
              <td>Ø Gemeinden</td>
              {cols.map((g) => (
                <td key={g} className="num">
                  {formatPct(s.avg[g])}
                </td>
              ))}
            </tr>,
            <tr key={`${s.code}-min`}>
              <td>Tiefste</td>
              {cols.map((g) => (
                <td key={g} className="num" title={name(s.min[g].muni)}>
                  {formatPct(s.min[g].rate)} <span className="muted">{name(s.min[g].muni)}</span>
                </td>
              ))}
            </tr>,
            <tr key={`${s.code}-max`}>
              <td>Höchste</td>
              {cols.map((g) => (
                <td key={g} className="num" title={name(s.max[g].muni)}>
                  {formatPct(s.max[g].rate)} <span className="muted">{name(s.max[g].muni)}</span>
                </td>
              ))}
            </tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}
