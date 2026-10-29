"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { formatIncomeTick } from "@/lib/format";

// Shared frame for "tax in % of gross salary" line charts: axes, salary
// marker, crosshair with tooltip, direct labels at the line ends.

export type RateSeries = {
  key: string;
  label: string; // direct label at the right end
  color: string;
  line: number[]; // % per grid income
  lower?: number[]; // optional dashed bounds with a faint band between
  upper?: number[];
};

type Props = {
  incomes: number[];
  income: number;
  series: RateSeries[];
  tooltip: (g: number) => ReactNode;
  ariaLabel: string;
  labelWidth?: number;
};

const W = 960;
const H = 470;

export default function RateChart({ incomes, income, series, tooltip, ariaLabel, labelWidth = 44 }: Props) {
  const [hoverG, setHoverG] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const M = { top: 16, right: labelWidth, bottom: 40, left: 48 };

  const x = scaleLinear().domain([0, incomes[incomes.length - 1]]).range([M.left, W - M.right]);
  const yMax = Math.max(10, ...series.flatMap((s) => s.upper ?? s.line));
  const y = scaleLinear().domain([0, yMax]).nice().range([H - M.bottom, M.top]);

  const path = line<number>()
    .x((_, g) => x(incomes[g]))
    .y((v) => y(v))
    .curve(curveMonotoneX);
  const band = (lower: number[], upper: number[]) =>
    area<number>()
      .x((g) => x(incomes[g]))
      .y0((g) => y(lower[g]))
      .y1((g) => y(upper[g]))
      .curve(curveMonotoneX)(incomes.map((_, g) => g)) ?? "";

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return;
    const px = (e.clientX - ctm.e) / ctm.a;
    if (px < M.left || px > W - M.right) return setHoverG(null);
    const inc = x.invert(px);
    let best = 0;
    incomes.forEach((v, g) => {
      if (Math.abs(v - inc) < Math.abs(incomes[best] - inc)) best = g;
    });
    setHoverG(best);
  };

  // direct labels at the right end of each line, nudged apart
  const endLabels = useMemo(() => {
    const last = incomes.length - 1;
    const items = series.map((s) => ({ key: s.key, label: s.label, y: y(s.line[last]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + 13);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, yMax, labelWidth]);

  const hoverX = hoverG === null ? null : x(incomes[hoverG]);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onPointer}
        onPointerLeave={() => setHoverG(null)}
      >
        {y.ticks(6).map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t} %
            </text>
          </g>
        ))}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />
        {x.ticks(10).map((t) => (
          <text key={t} x={x(t)} y={H - M.bottom + 18} textAnchor="middle">
            {formatIncomeTick(t)}
          </text>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle">
          Bruttolohn pro Jahr (CHF)
        </text>

        {income > 0 && income <= incomes[incomes.length - 1] && (
          <g pointerEvents="none">
            <line x1={x(income)} x2={x(income)} y1={M.top} y2={H - M.bottom} stroke="var(--text-muted)" strokeWidth={1} />
            <text x={x(income) + 4} y={M.top + 10} style={{ fill: "var(--text-secondary)" }}>
              Ihr Lohn
            </text>
          </g>
        )}

        {series.map((s) => (
          <g key={s.key} pointerEvents="none">
            {s.lower && s.upper && (
              <>
                <path d={band(s.lower, s.upper)} fill={s.color} opacity={0.08} />
                <path d={path(s.lower) ?? ""} fill="none" stroke={s.color} strokeWidth={1.25} strokeDasharray="4 3" />
                <path d={path(s.upper) ?? ""} fill="none" stroke={s.color} strokeWidth={1.25} strokeDasharray="4 3" />
              </>
            )}
            <path d={path(s.line) ?? ""} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
          </g>
        ))}

        {endLabels.map((l) => (
          <text key={l.key} x={W - M.right + 6} y={l.y} dy="0.32em" style={{ fill: "var(--text-secondary)", fontWeight: 600 }}>
            {l.label}
          </text>
        ))}

        {hoverX !== null && hoverG !== null && (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={M.top} y2={H - M.bottom} stroke="var(--axis)" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.key} cx={hoverX} cy={y(s.line[hoverG])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>

      {hoverX !== null && hoverG !== null && series.length > 0 && (
        <div
          className="tooltip"
          style={{
            top: 8,
            ...(hoverX > W / 2
              ? { right: `${((W - hoverX + 12) / W) * 100}%` }
              : { left: `${((hoverX + 12) / W) * 100}%` }),
          }}
        >
          {tooltip(hoverG)}
        </div>
      )}
    </div>
  );
}
