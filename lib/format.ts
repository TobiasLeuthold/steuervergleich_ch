const chf = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatChf = (v: number) => `CHF ${chf.format(Math.round(v))}`;
export const formatNumber = (v: number) => chf.format(Math.round(v));
export const formatPct = (v: number) => `${pct.format(v)} %`;

/** 250000 -> "250k", 1000000 -> "1 Mio." */
export const formatIncomeTick = (v: number) =>
  v >= 1_000_000 ? `${v / 1_000_000} Mio.` : v === 0 ? "0" : `${v / 1000}k`;
