"use client";

import { useEffect, useMemo, useState } from "react";
import type { Topology } from "topojson-specification";
import {
  CHURCH_OPTIONS,
  PROFILES,
  loadJson,
  totalsAt,
  type Church,
  type Meta,
  type ProfileKey,
  type Taxes,
} from "@/lib/data";
import { formatNumber } from "@/lib/format";
import TaxMap from "./TaxMap";
import Ranking from "./Ranking";
import TaxChart from "./TaxChart";
import MuniChart, { MAX_COMPARE } from "./MuniChart";

const MAX_INCOME = 1_000_000;

export default function TaxApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [topo, setTopo] = useState<Topology | null>(null);
  const [taxCache, setTaxCache] = useState<Partial<Record<ProfileKey, Taxes>>>({});
  const [error, setError] = useState<string | null>(null);

  const [income, setIncome] = useState(100_000);
  const [incomeText, setIncomeText] = useState(formatNumber(100_000));
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

  useEffect(() => {
    if (taxCache[profile]) return;
    loadJson<Taxes>(`taxes_${profile}.json`)
      .then((t) => setTaxCache((c) => ({ ...c, [profile]: t })))
      .catch((e) => setError(String(e)));
  }, [profile, taxCache]);

  // keep showing the previous profile while the next one loads
  const [shownProfile, setShownProfile] = useState<ProfileKey>(profile);
  useEffect(() => {
    if (taxCache[profile]) setShownProfile(profile);
  }, [profile, taxCache]);
  const taxes = taxCache[shownProfile] ?? null;
  const loadingProfile = shownProfile !== profile;

  const totals = useMemo(
    () => (meta && taxes ? totalsAt(meta, taxes, church, income) : null),
    [meta, taxes, church, income],
  );

  const setIncomeValue = (v: number) => {
    const clamped = Math.max(0, Math.min(MAX_INCOME, Math.round(v)));
    setIncome(clamped);
    setIncomeText(formatNumber(clamped));
  };

  const onIncomeText = (text: string) => {
    setIncomeText(text);
    const v = Number(text.replace(/[^\d]/g, ""));
    if (Number.isFinite(v)) setIncome(Math.min(MAX_INCOME, v));
  };

  if (error) return <div className="card">Daten konnten nicht geladen werden: {error}</div>;

  const profileHint = PROFILES.find((p) => p.key === profile)!.hint;

  return (
    <>
      <div className="card controls" role="group" aria-label="Eingaben">
        <label className="control control-income">
          Bruttolohn pro Jahr (CHF)
          <span className="income-row">
            <input
              className="income-input"
              type="text"
              inputMode="numeric"
              value={incomeText}
              onChange={(e) => onIncomeText(e.target.value)}
              onBlur={() => setIncomeValue(income)}
              aria-label="Bruttolohn in CHF"
            />
            <input
              type="range"
              min={0}
              max={MAX_INCOME}
              step={1000}
              value={income}
              onChange={(e) => setIncomeValue(Number(e.target.value))}
              aria-label="Bruttolohn Schieberegler"
            />
          </span>
        </label>
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
      </div>

      <section className="card" aria-labelledby="map-title" style={{ opacity: loadingProfile ? 0.6 : 1 }}>
        <h2 id="map-title">Jährliche Steuerbelastung nach Gemeinde</h2>
        <p className="card-sub">
          {profileHint}, Bruttolohn {formatNumber(income)} CHF, Steuerjahr {meta?.year ?? ""}.
          Einkommenssteuer Bund, Kanton und Gemeinde
          {church === "none" ? ", ohne Kirchensteuer" : " inkl. Kirchensteuer"}, kein Vermögen.
        </p>
        {meta && topo && taxes && totals ? (
          <>
            <TaxMap
              meta={meta}
              topo={topo}
              taxes={taxes}
              church={church}
              income={income}
              totals={totals}
              selectedBfs={selectedBfs}
              onSelect={setSelectedBfs}
              mapFilter={mapFilter}
            />
            <Ranking
              meta={meta}
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

      <section className="card" aria-labelledby="chart-title" style={{ opacity: loadingProfile ? 0.6 : 1 }}>
        <h2 id="chart-title">Steuerbelastung in % des Bruttolohns</h2>
        <p className="card-sub">
          Pro Kanton: Durchschnitt der Gemeinden (ungewichtet), tiefste und höchste Gemeinde.{" "}
          {profileHint}
          {church === "none" ? ", ohne Kirchensteuer" : ", inkl. Kirchensteuer"}.
        </p>
        {meta && taxes ? (
          <TaxChart meta={meta} taxes={taxes} church={church} income={income} />
        ) : (
          <p className="muted">Lade Daten …</p>
        )}
      </section>

      <section className="card" aria-labelledby="muni-chart-title" style={{ opacity: loadingProfile ? 0.6 : 1 }}>
        <h2 id="muni-chart-title">Gemeinden im Vergleich</h2>
        <p className="card-sub">
          Steuerbelastung in % des Bruttolohns für ausgewählte Gemeinden. {profileHint}
          {church === "none" ? ", ohne Kirchensteuer" : ", inkl. Kirchensteuer"}.
        </p>
        {meta && taxes ? (
          <MuniChart
            meta={meta}
            taxes={taxes}
            church={church}
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
        (Steuerjahr {meta?.year}). Berechnet für Einkommen aus unselbständiger Erwerbstätigkeit mit
        den Standardabzügen des Steuerrechners (AHV/IV/EO, ALV, NBU, BVG, Berufsauslagen,
        Pauschalabzüge); Werte zwischen den Stützstellen linear interpoliert. Gemeindegrenzen: BFS /
        swisstopo, Stand 2026. Ohne Gewähr.
      </footer>
    </>
  );
}
