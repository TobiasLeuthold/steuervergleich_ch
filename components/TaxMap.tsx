"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { quantileSorted } from "d3-array";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { breakdownAt, type Church, type Meta, type Taxes } from "@/lib/data";
import { formatChf, formatPct } from "@/lib/format";
import { usePrefersDark } from "@/lib/usePrefersDark";

const W = 960;
const H = 610;
const MAX_ZOOM = 40;

// sequential blue ramp (reference palette); low values recede toward the surface
const RAMP_LIGHT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const RAMP_DARK = ["#104281", "#184f95", "#256abf", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];

type Props = {
  meta: Meta;
  topo: Topology;
  taxes: Taxes;
  church: Church;
  income: number;
  totals: number[];
  selectedBfs: number | null;
  onSelect: (bfs: number | null) => void;
  /** municipalities checked in the ranking; empty = show all */
  mapFilter: Set<number>;
};

type Hover = { m: number; x: number; y: number };

export default function TaxMap({
  meta,
  topo,
  taxes,
  church,
  income,
  totals,
  selectedBfs,
  onSelect,
  mapFilter,
}: Props) {
  const dark = usePrefersDark();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [wheelHint, setWheelHint] = useState(false);

  const geo = useMemo(() => {
    const objects = topo.objects as Record<string, GeometryCollection>;
    const munis = feature(topo, objects.municipalities) as FeatureCollection<Geometry>;
    const country = feature(topo, objects.country) as FeatureCollection<Geometry>;
    const lakes = feature(topo, objects.lakes) as FeatureCollection<Geometry>;
    const projection = geoMercator().fitSize([W, H], country);
    const path = geoPath(projection);
    return {
      munis: munis.features.map((f: Feature<Geometry>) => ({
        bfs: Number(f.id),
        d: path(f) ?? "",
        bounds: path.bounds(f),
      })),
      cantonBorders: path(mesh(topo, objects.cantons, (a, b) => a !== b)) ?? "",
      countryOutline: path(mesh(topo, objects.country)) ?? "",
      lakes: path(lakes) ?? "",
    };
  }, [topo]);

  const muniIndex = useMemo(() => new Map(meta.munis.map((mu, i) => [mu.bfs, i])), [meta]);
  const geoByBfs = useMemo(() => new Map(geo.munis.map((g) => [g.bfs, g])), [geo]);
  const filtering = mapFilter.size > 0;

  // Zoom/pan: drag pans, double-click and the buttons zoom, the wheel only
  // with Ctrl/⌘ (trackpad pinch sends ctrlKey) so the page still scrolls.
  // The transform is set on the layer directly to avoid re-rendering 2'000 paths.
  useEffect(() => {
    const svg = svgRef.current!;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([
        [0, 0],
        [W, H],
      ])
      .clickDistance(4)
      // trackpad pinch sends many small deltas, a mouse wheel few large ones
      .wheelDelta((event: WheelEvent) => {
        const dy = event.deltaMode === 1 ? event.deltaY * 20 : event.deltaY;
        return -dy * (Math.abs(dy) < 50 ? 0.01 : 0.004);
      })
      .filter((event: Event) => {
        if (event.type === "wheel") {
          const we = event as WheelEvent;
          if (!we.ctrlKey && !we.metaKey) {
            setWheelHint(true);
            return false;
          }
          return true;
        }
        return !(event as MouseEvent).button;
      })
      .on("zoom", (event) => {
        layerRef.current?.setAttribute("transform", event.transform.toString());
        setZoomed(event.transform.k > 1.01);
        setHover(null);
      });
    select(svg).call(z);
    zoomRef.current = z;
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  useEffect(() => {
    if (!wheelHint) return;
    const t = setTimeout(() => setWheelHint(false), 1400);
    return () => clearTimeout(t);
  }, [wheelHint]);

  const zoomBy = (factor: number) => {
    const z = zoomRef.current;
    if (z) select(svgRef.current!).transition().duration(300).call(z.scaleBy, factor);
  };
  const zoomReset = () => {
    const z = zoomRef.current;
    if (z) select(svgRef.current!).transition().duration(400).call(z.transform, zoomIdentity);
  };
  const zoomToSelection = () => {
    const z = zoomRef.current;
    const boxes = [...mapFilter].map((b) => geoByBfs.get(b)?.bounds).filter((b) => b !== undefined);
    if (!z || boxes.length === 0) return;
    const x0 = Math.min(...boxes.map((b) => b[0][0]));
    const y0 = Math.min(...boxes.map((b) => b[0][1]));
    const x1 = Math.max(...boxes.map((b) => b[1][0]));
    const y1 = Math.max(...boxes.map((b) => b[1][1]));
    const k = Math.min(MAX_ZOOM, 0.85 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const t = zoomIdentity
      .translate(W / 2, H / 2)
      .scale(k)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    select(svgRef.current!).transition().duration(600).call(z.transform, t);
  };

  // ramp stops at quantiles of the shown municipalities: a few very low-tax
  // ones would otherwise squeeze the rest into the dark end of the ramp
  const color = useMemo(() => {
    const ramp = dark ? RAMP_DARK : RAMP_LIGHT;
    const shown = filtering
      ? [...mapFilter].flatMap((b) => {
          const m = muniIndex.get(b);
          return m === undefined ? [] : [totals[m]];
        })
      : [...totals];
    const sorted = shown.sort((a, b) => a - b);
    if (sorted.length === 0) sorted.push(0);
    const domain = ramp.map((_, i) => quantileSorted(sorted, i / (ramp.length - 1)) ?? 0);
    for (let i = 1; i < domain.length; i++) domain[i] = Math.max(domain[i], domain[i - 1] + 1e-6);
    return {
      scale: scaleLinear<string>().domain(domain).range(ramp).clamp(true),
      lo: sorted[0],
      median: quantileSorted(sorted, 0.5) ?? 0,
      hi: sorted[sorted.length - 1],
      ramp,
    };
  }, [totals, dark, filtering, mapFilter, muniIndex]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.buttons) return; // dragging
    const bfs = Number((e.target as SVGElement).getAttribute("data-bfs"));
    const m = muniIndex.get(bfs);
    const rect = wrapRef.current!.getBoundingClientRect();
    if (m === undefined) return setHover(null);
    setHover({ m, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const bfs = Number((e.target as SVGElement).getAttribute("data-bfs"));
    onSelect(muniIndex.has(bfs) && bfs !== selectedBfs ? bfs : null);
  };

  const fill = (bfs: number) => {
    const m = muniIndex.get(bfs);
    if (m === undefined || (filtering && !mapFilter.has(bfs))) return "var(--no-data)";
    return color.scale(totals[m]);
  };

  const highlight = [selectedBfs, hover ? meta.munis[hover.m].bfs : null].filter(
    (b): b is number => b !== null,
  );

  const tip = hover && tooltipContent(meta, taxes, church, income, hover.m);
  const wrapWidth = wrapRef.current?.clientWidth ?? W;

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Karte der Schweizer Gemeinden, eingefärbt nach Steuerbetrag"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
      >
        <g ref={layerRef}>
          <g>
            {geo.munis.map(({ bfs, d }) => (
              <path key={bfs} className="muni" d={d} data-bfs={bfs} fill={fill(bfs)} />
            ))}
          </g>
          <path d={geo.lakes} fill="var(--lake)" stroke="none" pointerEvents="none" />
          <path
            d={geo.cantonBorders}
            fill="none"
            stroke="var(--canton-border)"
            strokeWidth={0.9}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <path
            d={geo.countryOutline}
            fill="none"
            stroke="var(--axis)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {filtering &&
            [...mapFilter].map((bfs) => (
              <path
                key={`f-${bfs}`}
                d={geoByBfs.get(bfs)?.d}
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
          {highlight.map((bfs, i) => (
            <path
              key={`${bfs}-${i}`}
              d={geoByBfs.get(bfs)?.d}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth={bfs === selectedBfs ? 2 : 1.4}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
        </g>
      </svg>

      <div className="map-zoom" role="group" aria-label="Karte zoomen">
        <button onClick={() => zoomBy(2)} aria-label="Hineinzoomen" title="Hineinzoomen">
          +
        </button>
        <button onClick={() => zoomBy(0.5)} aria-label="Herauszoomen" title="Herauszoomen">
          −
        </button>
        <button onClick={zoomReset} disabled={!zoomed} aria-label="Ganze Schweiz" title="Ganze Schweiz">
          ⟲
        </button>
      </div>
      {filtering && (
        <button className="map-fit" onClick={zoomToSelection}>
          Auf Auswahl zoomen ({mapFilter.size})
        </button>
      )}
      {wheelHint && <div className="map-hint">⌘/Ctrl + Scrollen zum Zoomen · Ziehen zum Verschieben</div>}

      {tip && hover && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover.x + 14, wrapWidth - 240),
            top: hover.y + 14,
          }}
        >
          {tip}
        </div>
      )}

      <div className="legend" aria-hidden="true">
        <span>{formatChf(color.lo)}</span>
        <span className="legend-ramp-wrap">
          <span
            className="legend-ramp"
            style={{ background: `linear-gradient(to right, ${color.ramp.join(", ")})` }}
          />
          <span className="legend-median">
            Median {formatChf(color.median)}
            {filtering ? " (Auswahl)" : ""}
          </span>
        </span>
        <span>{formatChf(color.hi)}</span>
        <span style={{ marginLeft: 12 }}>
          <span className="legend-swatch" style={{ background: "var(--no-data)" }} />
          {filtering ? "nicht ausgewählt / keine Daten" : "keine Daten (unbewohnt)"}
        </span>
        <span>Ziehen verschiebt, ⌘/Ctrl + Scrollen oder Doppelklick zoomt, Klick hebt eine Gemeinde hervor.</span>
      </div>
    </div>
  );
}

function tooltipContent(meta: Meta, taxes: Taxes, church: Church, income: number, m: number) {
  const mu = meta.munis[m];
  const b = breakdownAt(meta, taxes, church, m, income);
  const rows: [string, number][] = [
    ["Bund", b.fed],
    ["Kanton", b.canton],
    ["Gemeinde", b.commune],
  ];
  if (church !== "none") rows.push(["Kirche", b.church]);
  return (
    <>
      <div className="tooltip-title">
        {mu.name} <span className="muted">({mu.canton})</span>
      </div>
      <table>
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">{formatChf(v)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td className="num">{formatChf(b.total)}</td>
          </tr>
          <tr>
            <td className="muted">vom Bruttolohn</td>
            <td className="num muted">{income > 0 ? formatPct((b.total / income) * 100) : "–"}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
