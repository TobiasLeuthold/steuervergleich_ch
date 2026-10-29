// Precomputed ESTV data (see scripts/fetch_estv.py, scripts/build_data.py)
// and the arithmetic on top of it: church tax option, interpolation between
// the income grid points, per-canton aggregates.

export type ProfileKey = "single" | "married" | "family";
export type Church = "none" | "ref" | "cat";

export const PROFILES: { key: ProfileKey; label: string; hint: string }[] = [
  { key: "single", label: "Ledig", hint: "ledig, keine Kinder, 35 Jahre" },
  { key: "married", label: "Verheiratet", hint: "verheiratet, Alleinverdiener, keine Kinder" },
  { key: "family", label: "Verheiratet, 2 Kinder", hint: "verheiratet, Alleinverdiener, 2 Kinder (8 und 10 Jahre)" },
];

export const CHURCH_OPTIONS: { key: Church; label: string }[] = [
  { key: "none", label: "Ohne Kirchensteuer" },
  { key: "ref", label: "Reformiert" },
  { key: "cat", label: "Römisch-katholisch" },
];

export const CANTONS: { code: string; name: string }[] = [
  { code: "ZH", name: "Zürich" },
  { code: "BE", name: "Bern" },
  { code: "LU", name: "Luzern" },
  { code: "UR", name: "Uri" },
  { code: "SZ", name: "Schwyz" },
  { code: "OW", name: "Obwalden" },
  { code: "NW", name: "Nidwalden" },
  { code: "GL", name: "Glarus" },
  { code: "ZG", name: "Zug" },
  { code: "FR", name: "Freiburg" },
  { code: "SO", name: "Solothurn" },
  { code: "BS", name: "Basel-Stadt" },
  { code: "BL", name: "Basel-Landschaft" },
  { code: "SH", name: "Schaffhausen" },
  { code: "AR", name: "Appenzell Ausserrhoden" },
  { code: "AI", name: "Appenzell Innerrhoden" },
  { code: "SG", name: "St. Gallen" },
  { code: "GR", name: "Graubünden" },
  { code: "AG", name: "Aargau" },
  { code: "TG", name: "Thurgau" },
  { code: "TI", name: "Tessin" },
  { code: "VD", name: "Waadt" },
  { code: "VS", name: "Wallis" },
  { code: "NE", name: "Neuenburg" },
  { code: "GE", name: "Genf" },
  { code: "JU", name: "Jura" },
];

export type Muni = { bfs: number; name: string; canton: string };

export type Meta = {
  year: number;
  source: string;
  incomes: number[];
  munis: Muni[];
};

export type Taxes = {
  profile: ProfileKey;
  fed: number[];
  base: number[][];
  canton: number[][];
  ref: number[][];
  cat: number[][];
};

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function loadJson<T>(file: string): Promise<T> {
  const res = await fetch(`${base}/data/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

/** Total tax at grid point g for municipality m. */
export function totalAt(t: Taxes, church: Church, m: number, g: number): number {
  return t.base[m][g] + (church === "none" ? 0 : t[church][m][g]);
}

/** Grid segment [i, i+1] and weight for an income (clamped to the grid). */
export function locate(incomes: number[], income: number): { i: number; w: number } {
  const last = incomes.length - 1;
  if (income <= incomes[0]) return { i: 0, w: 0 };
  if (income >= incomes[last]) return { i: last - 1, w: 1 };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (incomes[mid] <= income) lo = mid;
    else hi = mid;
  }
  return { i: lo, w: (income - incomes[lo]) / (incomes[lo + 1] - incomes[lo]) };
}

const lerp = (a: number, b: number, w: number) => a + (b - a) * w;

export type Breakdown = {
  total: number;
  fed: number;
  canton: number;
  commune: number; // communal tax + personal tax - tax credit
  church: number;
};

/** Tax of municipality m at any income, linearly interpolated. */
export function breakdownAt(
  meta: Meta,
  t: Taxes,
  church: Church,
  m: number,
  income: number,
): Breakdown {
  const { i, w } = locate(meta.incomes, income);
  const at = (arr: number[]) => lerp(arr[i], arr[i + 1], w);
  const fed = at(t.fed);
  const canton = at(t.canton[m]);
  const withoutChurch = at(t.base[m]);
  const churchTax = church === "none" ? 0 : at(t[church][m]);
  return {
    total: withoutChurch + churchTax,
    fed,
    canton,
    commune: withoutChurch - fed - canton,
    church: churchTax,
  };
}

/** Total tax of every municipality at an income (same order as meta.munis). */
export function totalsAt(meta: Meta, t: Taxes, church: Church, income: number): number[] {
  const { i, w } = locate(meta.incomes, income);
  return meta.munis.map((_, m) =>
    lerp(totalAt(t, church, m, i), totalAt(t, church, m, i + 1), w),
  );
}

export type CantonSeries = {
  code: string;
  /** effective rate in % per grid income; min/max carry the municipality */
  avg: number[];
  min: { rate: number; muni: number }[];
  max: { rate: number; muni: number }[];
};

/**
 * Per income grid point: unweighted mean of the canton's municipalities and
 * the lowest / highest municipality (pointwise, so the municipality may
 * change along the curve).
 */
export function cantonSeries(meta: Meta, t: Taxes, church: Church, code: string): CantonSeries {
  const members = meta.munis.flatMap((mu, m) => (mu.canton === code ? [m] : []));
  const avg: number[] = [];
  const min: CantonSeries["min"] = [];
  const max: CantonSeries["max"] = [];
  meta.incomes.forEach((income, g) => {
    let sum = 0;
    let lo = { rate: Infinity, muni: -1 };
    let hi = { rate: -Infinity, muni: -1 };
    for (const m of members) {
      const rate = income > 0 ? (totalAt(t, church, m, g) / income) * 100 : 0;
      sum += rate;
      if (rate < lo.rate) lo = { rate, muni: m };
      if (rate > hi.rate) hi = { rate, muni: m };
    }
    avg.push(sum / members.length);
    min.push(lo);
    max.push(hi);
  });
  return { code, avg, min, max };
}
