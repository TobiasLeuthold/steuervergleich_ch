"use client";

import { useEffect, useMemo, useState } from "react";
import type { Topology } from "topojson-specification";
import {
  CHURCH_OPTIONS,
  PROFILES,
  corpMeta,
  loadCorpTaxes,
  loadJson,
  totalsAt,
  type Church,
  type Meta,
  type Mode,
  type ProfileKey,
  type Taxes,
} from "@/lib/data";
import { formatChf, formatNumber } from "@/lib/format";
import { LABELS, LabelsContext } from "@/lib/labels";
import TaxMap from "./TaxMap";
import Ranking from "./Ranking";
import TaxChart from "./TaxChart";
import MuniChart, { MAX_COMPARE } from "./MuniChart";

const MAX_INCOME = 1_000_000;
const MAX_PROFIT = 2_000_000;
const MODES: { key: Mode; label: string }[] = [
  { key: "private", label: "Privatperson" },
  { key: "corp", label: "Unternehmen" },
];

export default function TaxApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [topo, setTopo] = useState<Topology | null>(null);
  // loaded tax files: profile key, or "corp_<capital>" for company taxes
  const [taxCache, setTaxCache] = useState<Record<string, Taxes>>({});
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("private");
  // salary (private) and profit (company) are kept apart when switching
  const [amounts, setAmounts] = useState<Record<Mode, number>>({ private: 100_000, corp: 200_000 });
  const [incomeText, setIncomeText] = useState(formatNumber(100_000));
  const [capital, setCapital] = useState(100_000);
  const [profile, setProfile] = useState<ProfileKey>("single");
  const [church, setChurch] = useState<Church>("none");
  const [selectedBfs, setSelectedBfs] = useState<number | null>(null);
  const [mapFilter, setMapFilter] = useState<Set<number>>(new Set());
  // municipalities in the comparison chart: bfs -> categorical slot (1-8)
  const [compare, setCompare] = useState<Record<number, number>>({ 261: 1, 1711: 2, 351: 3, 5586: 4 });

  const addCompare = (bfs: number) =>
    setCompare((c) => {
      if (c[bfs] || Object.keys(c).length >= MAX_COMPARE) return c;
      const used = new Set(Object.values(c));
      const free = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !used.has(n))!;
      return { ...c, [bfs]: free };
    });
  const removeCompare = (bfs: number) =>
    setCompare((c) => {
      const next = { ...c };
      delete next[bfs];
      return next;
    });

  useEffect(() => {
    Promise.all([loadJson<Meta>("meta.json"), loadJson<Topology>("map.json")])
      .then(([m, t]) => {
        setMeta(m);
        setTopo(t);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const dataKey = mode === "corp" ? `corp_${capital}` : profile;
  useEffect(() => {
    if (taxCache[dataKey]) return;
    const load = mode === "corp" ? loadCorpTaxes(capital) : loadJson<Taxes>(`taxes_${profile}.json`);
    load.then((t) => setTaxCache((c) => ({ ...c, [dataKey]: t }))).catch((e) => setError(String(e)));
  }, [dataKey, mode, capital, profile, taxCache]);

  // keep showing the previous data while the next file loads
  const [shownKey, setShownKey] = useState(dataKey);
  useEffect(() => {
    if (taxCache[dataKey]) setShownKey(dataKey);
  }, [dataKey, taxCache]);
  const taxes = taxCache[shownKey] ?? null;
  const shownCorp = taxes?.profile === "corp";
  const loadingData = shownKey !== dataKey;

  // the components read the x grid from meta.incomes
  const viewMeta = useMemo(() => (meta && shownCorp ? corpMeta(meta) : meta), [meta, shownCorp]);
  const viewChurch: Church = shownCorp ? "none" : church;
  const income = amounts[shownCorp ? "corp" : "private"];
  const maxAmount = mode === "corp" ? MAX_PROFIT : MAX_INCOME;
  const L = LABELS[mode];

  const totals = useMemo(
    () => (viewMeta && taxes ? totalsAt(viewMeta, taxes, viewChurch, income) : null),
    [viewMeta, taxes, viewChurch, income],
  );

  const setAmount = (v: number) => setAmounts((a) => ({ ...a, [mode]: v }));
  const setIncomeValue = (v: number) => {
    const clamped = Math.max(0, Math.min(maxAmount, Math.round(v)));
    setAmount(clamped);
    setIncomeText(formatNumber(clamped));
  };

  const onIncomeText = (text: string) => {
    setIncomeText(text);
    const v = Number(text.replace(/[^\d]/g, ""));
    if (Number.isFinite(v)) setAmount(Math.min(maxAmount, v));
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setIncomeText(formatNumber(amounts[next]));
  };

  if (error) return <div className="card">Daten konnten nicht geladen werden: {error}</div>;

  const capitalHint = `steuerbares Eigenkapital ${formatChf(capital)}`;
  const profileHint =
    mode === "corp"
      ? `Ordentlich besteuerte Kapitalgesellschaft (AG/GmbH), ${capitalHint}`
      : PROFILES.find((p) => p.key === profile)!.hint;
  const churchNote =
    mode === "corp" ? "" : church === "none" ? ", ohne Kirchensteuer" : ", inkl. Kirchensteuer";
  const corpAvailable = Boolean(meta?.corp);

  return (
    <>
      <LabelsContext.Provider value={L}>
      <div className="card controls" role="group" aria-label="Eingaben">
        <div className="control control-mode">
          Steuerpflichtige
          <div className="segmented">
            {MODES.map((m) => (
              <button
                key={m.key}
                aria-pressed={mode === m.key}
                disabled={m.key === "corp" && !corpAvailable}
                title={
                  m.key === "corp"
                    ? corpAvailable
                      ? "Gewinn- und Kapitalsteuer einer AG/GmbH"
                      : "Unternehmensdaten fehlen (scripts/fetch_estv_corp.py)"
                    : "Einkommenssteuer einer Privatperson"
                }
                onClick={() => switchMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <label className="control control-income">
          {L.amount} pro Jahr (CHF)
          <span className="income-row">
            <input
              className="income-input"
              type="text"
              inputMode="numeric"
              value={incomeText}
              onChange={(e) => onIncomeText(e.target.value)}
              onBlur={() => setIncomeValue(income)}
              aria-label={`${L.amount} in CHF`}
            />
            <input
              type="range"
              min={0}
              max={maxAmount}
              step={mode === "corp" ? 5000 : 1000}
              value={amounts[mode]}
              onChange={(e) => setIncomeValue(Number(e.target.value))}
              aria-label={`${L.amount} Schieberegler`}
            />
          </span>
        </label>
        {mode === "corp" ? (
          <label className="control">
            Steuerbares Eigenkapital
            <select value={capital} onChange={(e) => setCapital(Number(e.target.value))}>
              {(meta?.corp?.capitals ?? []).map((c) => (
                <option key={c} value={c}>
                  {formatChf(c)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
        <div className="control">
          Haushalt
          <div className="segmented">
            {PROFILES.map((p) => (
              <button
                key={p.key}
                aria-pressed={profile === p.key}
                title={p.hint}
                onClick={() => setProfile(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <label className="control">
          Konfession
          <select value={church} onChange={(e) => setChurch(e.target.value as Church)}>
            {CHURCH_OPTIONS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
          </>
        )}
      </div>

      <section className="card" aria-labelledby="map-title" style={{ opacity: loadingData ? 0.6 : 1 }}>
        <h2 id="map-title">Jährliche Steuerbelastung nach Gemeinde</h2>
        <p className="card-sub">
          {profileHint}, {L.amount} {formatNumber(income)} CHF, Steuerjahr {meta?.year ?? ""}.{" "}
          {mode === "corp" ? (
            <>
              Gewinnsteuer Bund, Kanton und Gemeinde plus Kapitalsteuer (inkl. Kirchen- und
              Minimalsteuern, wo der Kanton sie bei Unternehmen erhebt).
            </>
          ) : (
            <>
              Einkommenssteuer Bund, Kanton und Gemeinde
              {church === "none" ? ", ohne Kirchensteuer" : " inkl. Kirchensteuer"}, kein Vermögen.
            </>
          )}
        </p>
        {viewMeta && topo && taxes && totals ? (
          <>
            <TaxMap
              meta={viewMeta}
              topo={topo}
              taxes={taxes}
              church={viewChurch}
              income={income}
              totals={totals}
              selectedBfs={selectedBfs}
              onSelect={setSelectedBfs}
              mapFilter={mapFilter}
            />
            <Ranking
              meta={viewMeta}
              totals={totals}
              income={income}
              selectedBfs={selectedBfs}
              onSelect={setSelectedBfs}
              compare={compare}
              onCompare={addCompare}
              mapFilter={mapFilter}
              onMapFilter={setMapFilter}
            />
          </>
        ) : (
          <p className="muted">Lade Daten …</p>
        )}
      </section>

      <section className="card" aria-labelledby="chart-title" style={{ opacity: loadingData ? 0.6 : 1 }}>
        <h2 id="chart-title">Steuerbelastung in % {mode === "corp" ? "des Gewinns vor Steuern" : "des Bruttolohns"}</h2>
        <p className="card-sub">
          Pro Kanton: Durchschnitt der Gemeinden (ungewichtet), tiefste und höchste Gemeinde.{" "}
          {profileHint}
          {churchNote}.
        </p>
        {viewMeta && taxes ? (
          <TaxChart meta={viewMeta} taxes={taxes} church={viewChurch} income={income} />
        ) : (
          <p className="muted">Lade Daten …</p>
        )}
      </section>

      <section className="card" aria-labelledby="muni-chart-title" style={{ opacity: loadingData ? 0.6 : 1 }}>
        <h2 id="muni-chart-title">Gemeinden im Vergleich</h2>
        <p className="card-sub">
          Steuerbelastung in % {mode === "corp" ? "des Gewinns vor Steuern" : "des Bruttolohns"} für
          ausgewählte Gemeinden. {profileHint}
          {churchNote}.
        </p>
        {viewMeta && taxes ? (
          <MuniChart
            meta={viewMeta}
            taxes={taxes}
            church={viewChurch}
            income={income}
            compare={compare}
            onAdd={addCompare}
            onRemove={removeCompare}
          />
        ) : (
          <p className="muted">Lade Daten …</p>
        )}
      </section>

      <footer>
        Quelle: Eidgenössische Steuerverwaltung ESTV,{" "}
        <a href="https://swisstaxcalculator.estv.admin.ch" target="_blank" rel="noreferrer">
          Steuerrechner
        </a>{" "}
        (Steuerjahr {meta?.year}).{" "}
        {mode === "corp" ? (
          <>
            Unternehmen: Gewinn vor Steuern (der Rechner zieht die Steuern als Aufwand ab), ohne
            Beteiligungsabzug, Patentbox oder F&amp;E-Abzug; Aktien-/Stammkapital = steuerbares
            Eigenkapital, höchstens CHF 100&apos;000.
          </>
        ) : (
          <>
            Berechnet für Einkommen aus unselbständiger Erwerbstätigkeit mit den Standardabzügen des
            Steuerrechners (AHV/IV/EO, ALV, NBU, BVG, Berufsauslagen, Pauschalabzüge).
          </>
        )}{" "}
        Werte zwischen den Stützstellen linear interpoliert. Gemeindegrenzen: BFS / swisstopo, Stand
        2026. Ohne Gewähr.
      </footer>
      </LabelsContext.Provider>
    </>
  );
}
