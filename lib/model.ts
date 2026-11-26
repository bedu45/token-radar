// Token Radar v2 — model "radar-3": one snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// pre-token protocol that passes the house's own exclusion rule — the same rule that built the
// watchlist, applied to all rows, at any TVL: not a wrapped, staked or bridged product, not a
// versioned pool, not an exchange product. The watchlist is the floor, never the ceiling. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id,
// no symbol); the snapshot's live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures. No protocol name is ever
// special-cased and no price is ever hardcoded: the multiples are fitted from the snapshot's own
// tokened peers at runtime, and the page recomputes every row from the same figures.
//
//   multiple     = shrunk category median mcap/tvl of tokened peers (mcap > 0, tvl > 0,
//                    exchanges excluded — their tokens are not protocol launches):
//                    (n x category median + 5 x global median) / (n + 5), capped at 2x the
//                    global median, floored at 0.01; when a category has no peer at all, the
//                    global median. The shrinkage is a coherence change, not an accuracy claim:
//                    it is accuracy-neutral on both blind tests (see the ablation table), and
//                    it removes the cliff where half the board shared one fallback number.
//   growth       = clamp(change_7d, -60, 120) per cent; null change_7d is neutral (1.0)
//   growthMult   = 1 + (growth / 100) x 0.5
//   maturity     = 0.6 + min(age_days, 1095) / 1095 x 0.4
//                  age_days unknown: the median age of the snapshot's listed protocols
//   implied      = max(1, round(tvl_usd x multiple x growthMult x maturity))
//   range        = tvl_usd x peer p25 / p75 x growthMult x maturityMult — the same peers,
//                    the honest statement of what the multiple is worth. The point value is the
//                    median-based ranking number; the range is the uncertainty. A point estimate
//                    pretends a precision the data does not have (median held-out error 87%).
//
// Token odds come from the peers' own record, not from a guess: the launch rate of the
// protocol's category (smoothed toward the global rate with a prior of 5 protocols) blended
// half-and-half with the launch rate of its age band. The odds do NOT multiply the implied
// value — the value formula stays auditable on its own — they decide the farm verdict and are
// shown beside every row, with the expected value (implied x odds) in the detail view. The odds
// are a frequency claim: they are checked held-out (see the calibration table), and the bins
// the model predicts land where the peers' record says they should.
//
//   Farm now  odds >= 0.45 and implied >= $10,000,000
//   Watch     odds >= 0.30 or implied >= $10,000,000
//   Skip      otherwise
//
// Held-out check: the tokened peers are split in two by slug order (split A) and by odd/even
// slug order (split B); the multiples are fitted on the first half and used to predict the
// second half's market caps with each variant of the formula. The median and p75 errors are
// reported in the dashboard's methodology, so the reader sees what the multiple is worth and
// which terms the evidence keeps: it sets the level for ranking, it is not a price prediction.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. Data-derived numbers are fitted at runtime. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_peers: number;
  odds_prior: number;
  farm_now_odds: number;
  farm_now_value: number;
  watch_odds: number;
  watch_value: number;
  shrink_prior: number;
  shrink_cap_mult: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  multiple_floor: 0.01,
  multiple_cap: 2.0,
  min_peers: 3,
  odds_prior: 5,
  farm_now_odds: 0.45,
  farm_now_value: 10_000_000,
  watch_odds: 0.3,
  watch_value: 10_000_000,
  shrink_prior: 5,
  shrink_cap_mult: 2,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  implied_share: number;
  token_odds: number;
  verdict: 'Farm now' | 'Watch' | 'Skip';
  verdict_reason: string;
  model: {
    multiple: number;
    multiple_peers: number;
    category_median: number;
    peer_p25: number;
    peer_p75: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    category_launch_rate: number;
    age_band_launch_rate: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  implied_share: number;
  token_odds: number;
  verdict: 'Farm now' | 'Watch' | 'Skip';
  verdict_reason: string;
  watchlist: boolean;
  multiple: number;
  multiple_peers: number;
  category_median: number;
  peer_p25: number;
  peer_p75: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_launch_rate: number;
  age_band_launch_rate: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One ablation cell: a formula variant's held-out error on one blind split. */
export interface AblationCell {
  variant: string;
  split: string;
  median_error_pct: number;
  p75_error_pct: number;
  n: number;
}

/** One odds-calibration bin: what the model predicted vs what the peers' record did. */
export interface CalibrationBin {
  bin: string;
  n: number;
  predicted_pct: number;
  actual_pct: number;
}

/** How the snapshot's 758 protocols are accounted for. */
export interface Coverage {
  total: number;
  ranked: number;
  live_shown: number;
  tokened_not_shown: number;
  pretoken_excluded: number;
  excluded_by_reason: { reason: string; count: number }[];
}

/** The numbers the model fitted from the snapshot, so the page can state and re-derive them. */
export interface FittedStats {
  global_multiple: number;
  peer_count: number;
  median_age_days: number;
  global_launch_rate: number;
  age_band_launch_rate: number[];
  heldout_median_error_pct: number;
  heldout_p75_error_pct: number;
  heldout_n: number;
  ablation: AblationCell[];
  calibration: CalibrationBin[];
  coverage: Coverage;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fitted: FittedStats;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-or-not number list; null when empty. Deterministic. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a number list (linear interpolation); null when empty. Deterministic. */
function quantileOf(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped / staked / staking in a name: a wrapped or staked product. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;
/** An exchange's name at the start of a protocol's name: an exchange product. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** Categories the house rule reads as wrapped, staked or bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked, bridged, versioned or exchange product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGES.some((e) => p.name.startsWith(e))
  );
}

/** The one reason a pre-token protocol is excluded, in priority order, for the coverage accounting. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `category ${p.category}`;
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped/staked name';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'exchange product';
  return null;
}

/** The tokened peers the multiples are fitted from: a token that trades, with a market cap and TVL. Exchanges excluded. */
function peers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** The age band a protocol's age falls in, for the launch-rate table. */
function ageBand(age: number | null): number {
  if (age === null) return -1;
  if (age < 180) return 0;
  if (age < 365) return 1;
  if (age < 730) return 2;
  if (age < 1095) return 3;
  return 4;
}

const AGE_BAND_LABELS = ['0–6 months', '6–12 months', '1–2 years', '2–3 years', 'over 3 years'];

/** The fitted multiple for one category: the shrunk median, its raw median, its peer count and its p25/p75. */
export interface CategoryFit {
  multiple: number;
  categoryMedian: number;
  peers: number;
  p25: number;
  p75: number;
}

/** Everything fitted from the snapshot: multiples, launch rates, median age, held-out error, ablation, calibration, coverage. */
export interface Fitted {
  multiples: Map<string, CategoryFit>;
  globalMultiple: number;
  globalP25: number;
  globalP75: number;
  peerCount: number;
  medianAge: number;
  globalLaunchRate: number;
  categoryLaunchRate: Map<string, number>;
  ageBandLaunchRate: number[];
  heldoutMedianError: number;
  heldoutP75Error: number;
  heldoutN: number;
  ablation: AblationCell[];
  calibration: CalibrationBin[];
  coverage: Coverage;
}

/** The shrunk multiple for a category: (n x category median + k x global median) / (n + k), capped at capMult x global. */
function shrinkMultiple(catMedian: number, n: number, globalMedian: number, model: ModelConstants): number {
  const shrunk = (n * catMedian + model.shrink_prior * globalMedian) / (n + model.shrink_prior);
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, Math.min(shrunk, model.shrink_cap_mult * globalMedian)));
}

/** One formula variant's held-out errors on a train/test split of tokened peers. */
function heldoutFor(
  train: SnapshotProtocol[],
  test: SnapshotProtocol[],
  variant: string,
  model: ModelConstants,
  medianAge: number,
  asOf: string,
): { median: number; p75: number; n: number } {
  const trainByCat = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? 'Other';
    const list = trainByCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    trainByCat.set(key, list);
  }
  const trainGlobal = medianOf(train.map((p) => p.mcap_usd! / p.tvl_usd)) ?? 0.25;
  const errors: number[] = [];
  for (const p of test) {
    const ratios = trainByCat.get(p.category ?? 'Other') ?? [];
    let mult: number;
    if (variant === 'flat 0.25') {
      mult = 0.25;
    } else {
      const catMed = ratios.length > 0 ? medianOf(ratios)! : trainGlobal;
      mult = variant === 'multiple only' || variant === 'multiple + momentum' || variant === 'multiple + maturity' || variant === 'full formula'
        ? (ratios.length > 0 ? shrinkMultiple(catMed, ratios.length, trainGlobal, model) : trainGlobal)
        : trainGlobal;
    }
    const age = ageDays(asOf, p.listed_at) ?? medianAge;
    const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
    const useMomentum = variant === 'full formula' || variant === 'multiple + momentum';
    const useMaturity = variant === 'full formula' || variant === 'multiple + maturity';
    const growthMult = useMomentum ? 1 + (growthPct / 100) * model.growth_weight : 1;
    const maturityMult = useMaturity
      ? model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range
      : 1;
    const predicted = Math.max(1, Math.round(p.tvl_usd * mult * growthMult * maturityMult));
    errors.push(Math.abs(predicted - p.mcap_usd!) / p.mcap_usd!);
  }
  errors.sort((a, b) => a - b);
  const median = errors.length > 0 ? errors[Math.floor(errors.length / 2)]! : 0;
  const p75 = errors.length > 0 ? errors[Math.floor(errors.length * 0.75)]! : 0;
  return { median, p75, n: test.length };
}

/** The odds calibration: fit launch rates on half the protocols, check the other half by predicted-odds bin. */
function calibrateOdds(snapshot: Snapshot, model: ModelConstants): CalibrationBin[] {
  const ordered = [...snapshot.protocols].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const train = ordered.slice(0, Math.floor(ordered.length / 2));
  const test = ordered.slice(Math.floor(ordered.length / 2));
  const trainGlobal = train.filter((p) => !isPreToken(p)).length / Math.max(1, train.length);
  const cats = new Map<string, { tokened: number; total: number }>();
  for (const p of train) {
    const key = p.category ?? 'Other';
    const c = cats.get(key) ?? { tokened: 0, total: 0 };
    c.total += 1;
    if (!isPreToken(p)) c.tokened += 1;
    cats.set(key, c);
  }
  const catRate = new Map<string, number>();
  for (const [cat, c] of cats) {
    catRate.set(cat, (c.tokened + model.odds_prior * trainGlobal) / (c.total + model.odds_prior));
  }
  const bandCounts: { tokened: number; total: number }[] = Array.from({ length: 5 }, () => ({ tokened: 0, total: 0 }));
  for (const p of train) {
    const b = ageBand(ageDays(snapshot.as_of, p.listed_at));
    if (b < 0) continue;
    bandCounts[b]!.total += 1;
    if (!isPreToken(p)) bandCounts[b]!.tokened += 1;
  }
  const bandRate = bandCounts.map((c) => (c.total > 0 ? c.tokened / c.total : trainGlobal));
  const bins: { label: string; lo: number; hi: number; predicted: number[]; actual: number[] }[] = [
    { label: '0–30%', lo: 0, hi: 0.3, predicted: [], actual: [] },
    { label: '30–45%', lo: 0.3, hi: 0.45, predicted: [], actual: [] },
    { label: '45–60%', lo: 0.45, hi: 0.6, predicted: [], actual: [] },
    { label: '60%+', lo: 0.6, hi: 1.01, predicted: [], actual: [] },
  ];
  for (const p of test) {
    const cr = catRate.get(p.category ?? 'Other') ?? trainGlobal;
    const b = ageBand(ageDays(snapshot.as_of, p.listed_at));
    const ar = b >= 0 ? bandRate[b]! : trainGlobal;
    const odds = (cr + ar) / 2;
    const bin = bins.find((x) => odds >= x.lo && odds < x.hi) ?? bins[bins.length - 1]!;
    bin.predicted.push(odds);
    bin.actual.push(isPreToken(p) ? 0 : 1);
  }
  return bins.map((b) => ({
    bin: b.label,
    n: b.predicted.length,
    predicted_pct: b.predicted.length > 0 ? Math.round((b.predicted.reduce((s, v) => s + v, 0) / b.predicted.length) * 1000) / 10 : 0,
    actual_pct: b.actual.length > 0 ? Math.round((b.actual.reduce((s, v) => s + v, 0) / b.actual.length) * 1000) / 10 : 0,
  }));
}

/** How the snapshot's protocols are accounted for: ranked, live shown, tokened set aside, excluded by reason. */
function coverageAccounting(snapshot: Snapshot, rankedCount: number, liveCount: number): Coverage {
  const tokened = snapshot.protocols.filter((p) => !isPreToken(p));
  const pretoken = snapshot.protocols.filter((p) => isPreToken(p));
  const byReason = new Map<string, number>();
  for (const p of pretoken) {
    const r = exclusionReason(p);
    if (r !== null) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  }
  const excluded_by_reason = [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1));
  return {
    total: snapshot.protocols.length,
    ranked: rankedCount,
    live_shown: liveCount,
    tokened_not_shown: Math.max(0, tokened.length - liveCount),
    pretoken_excluded: Math.max(0, pretoken.length - rankedCount),
    excluded_by_reason,
  };
}

export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): Fitted {
  const tokened = peers(snapshot);
  const byCategory = new Map<string, number[]>();
  for (const p of tokened) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const allRatios = tokened.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMultiple = medianOf(allRatios) ?? 0.25;
  const globalP25 = quantileOf(allRatios, 0.25) ?? globalMultiple;
  const globalP75 = quantileOf(allRatios, 0.75) ?? globalMultiple;
  const multiples = new Map<string, CategoryFit>();
  for (const [cat, ratios] of byCategory) {
    const catMed = medianOf(ratios)!;
    const multiple = shrinkMultiple(catMed, ratios.length, globalMultiple, model);
    multiples.set(cat, {
      multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, multiple)),
      categoryMedian: catMed,
      peers: ratios.length,
      p25: quantileOf(ratios, 0.25) ?? catMed,
      p75: quantileOf(ratios, 0.75) ?? catMed,
    });
  }

  const ages = snapshot.protocols
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  const medianAge = medianOf(ages) ?? 365;

  const globalLaunchRate =
    snapshot.protocols.filter((p) => !isPreToken(p)).length / Math.max(1, snapshot.protocols.length);
  const categoryLaunchRate = new Map<string, number>();
  const cats = new Map<string, { tokened: number; total: number }>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Other';
    const c = cats.get(key) ?? { tokened: 0, total: 0 };
    c.total += 1;
    if (!isPreToken(p)) c.tokened += 1;
    cats.set(key, c);
  }
  for (const [cat, c] of cats) {
    categoryLaunchRate.set(
      cat,
      (c.tokened + model.odds_prior * globalLaunchRate) / (c.total + model.odds_prior),
    );
  }
  const bandCounts: { tokened: number; total: number }[] = Array.from({ length: 5 }, () => ({ tokened: 0, total: 0 }));
  for (const p of snapshot.protocols) {
    const b = ageBand(ageDays(snapshot.as_of, p.listed_at));
    if (b < 0) continue;
    bandCounts[b]!.total += 1;
    if (!isPreToken(p)) bandCounts[b]!.tokened += 1;
  }
  const ageBandLaunchRate = bandCounts.map((c) =>
    c.total > 0 ? c.tokened / c.total : globalLaunchRate,
  );

  // Held-out check, two blind splits: A (first/second half by slug) and B (odd/even slug order).
  // Each variant is fitted on the train half and used to predict the test half's market caps.
  const ordered = [...tokened].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const splitA = {
    train: ordered.slice(0, Math.floor(ordered.length / 2)),
    test: ordered.slice(Math.floor(ordered.length / 2)),
  };
  const splitB = {
    train: ordered.filter((_, i) => i % 2 === 0),
    test: ordered.filter((_, i) => i % 2 === 1),
  };
  const variants = ['full formula', 'multiple only', 'multiple + momentum', 'multiple + maturity', 'flat 0.25'];
  const ablation: AblationCell[] = [];
  for (const v of variants) {
    for (const [label, s] of [['split A', splitA], ['split B', splitB]] as const) {
      const r = heldoutFor(s.train, s.test, v, model, medianAge, snapshot.as_of);
      ablation.push({
        variant: v,
        split: label,
        median_error_pct: Math.round(r.median * 1000) / 10,
        p75_error_pct: Math.round(r.p75 * 1000) / 10,
        n: r.n,
      });
    }
  }
  const fullA = ablation.find((c) => c.variant === 'full formula' && c.split === 'split A')!;
  const heldoutMedianError = fullA.median_error_pct / 100;
  const heldoutP75Error = fullA.p75_error_pct / 100;
  const heldoutN = fullA.n;

  const calibration = calibrateOdds(snapshot, model);
  // Coverage is completed in buildRadar (it needs the board size); here the ranked count is
  // every protocol the board will carry: the watchlist plus every rankable protocol.
  const watchlistSet = new Set(snapshot.watchlist);
  const rankedCount = snapshot.protocols.filter((p) => watchlistSet.has(p.slug) || isRankable(p)).length;
  const coverage = coverageAccounting(snapshot, rankedCount, LIVE_ROWS);

  return {
    multiples,
    globalMultiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, globalMultiple)),
    globalP25,
    globalP75,
    peerCount: tokened.length,
    medianAge,
    globalLaunchRate,
    categoryLaunchRate,
    ageBandLaunchRate,
    heldoutMedianError,
    heldoutP75Error,
    heldoutN,
    ablation,
    calibration,
    coverage,
  };
}

/** The multiple one protocol gets: its category's shrunk median, or the global median when the category has no peer. Rounded to
    4 decimals before it is used, so the page's recompute from the stored multiple is exact. The peer range (p25–p75) comes
    from the category only when it has at least min_peers peers; a thin category falls back to the global peer set, because
    one peer's ratio is not a range. */
function multipleFor(p: SnapshotProtocol, fitted: Fitted, model: ModelConstants): CategoryFit {
  const hit = fitted.multiples.get(p.category ?? 'Other');
  const globalP25 = Math.round(fitted.globalP25 * 1e4) / 1e4;
  const globalP75 = Math.round(fitted.globalP75 * 1e4) / 1e4;
  if (hit !== undefined) {
    const useCategoryRange = hit.peers >= model.min_peers;
    return {
      multiple: Math.round(hit.multiple * 1e4) / 1e4,
      categoryMedian: Math.round(hit.categoryMedian * 1e4) / 1e4,
      peers: hit.peers,
      p25: useCategoryRange ? Math.round(hit.p25 * 1e4) / 1e4 : globalP25,
      p75: useCategoryRange ? Math.round(hit.p75 * 1e4) / 1e4 : globalP75,
    };
  }
  return {
    multiple: Math.round(fitted.globalMultiple * 1e4) / 1e4,
    categoryMedian: Math.round(fitted.globalMultiple * 1e4) / 1e4,
    peers: 0,
    p25: globalP25,
    p75: globalP75,
  };
}

/** The launch odds of one protocol: its category's smoothed rate blended with its age band's rate. */
function oddsFor(p: SnapshotProtocol, age: number | null, fitted: Fitted): { odds: number; catRate: number; ageRate: number } {
  const catRate = fitted.categoryLaunchRate.get(p.category ?? 'Other') ?? fitted.globalLaunchRate;
  const band = ageBand(age);
  const ageRate = band >= 0 ? fitted.ageBandLaunchRate[band]! : fitted.globalLaunchRate;
  const odds = (catRate + ageRate) / 2;
  return { odds: Math.round(odds * 1e4) / 1e4, catRate: Math.round(catRate * 1e4) / 1e4, ageRate: Math.round(ageRate * 1e4) / 1e4 };
}

/** The three multipliers, the implied value and its peer range one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fitted: Fitted,
): { implied: number; impliedLow: number; impliedHigh: number; multiple: number; peers: number; categoryMedian: number; peerP25: number; peerP75: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? fitted.medianAge;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const fit = multipleFor(protocol, fitted, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * fit.multiple * growthMult * maturityMult));
  const rawLow = Math.max(1, Math.round(protocol.tvl_usd * fit.p25 * growthMult * maturityMult));
  const rawHigh = Math.max(1, Math.round(protocol.tvl_usd * fit.p75 * growthMult * maturityMult));
  // The range always brackets the point value: shrinkage can pull the multiple outside the peer
  // p25–p75, and the range is the honest statement, so it must contain the number it ranges over.
  const impliedLow = Math.min(rawLow, implied);
  const impliedHigh = Math.max(rawHigh, implied);
  return { implied, impliedLow, impliedHigh, multiple: fit.multiple, peers: fit.peers, categoryMedian: fit.categoryMedian, peerP25: fit.p25, peerP75: fit.p75, growthPct, growthMult, maturityMult, age };
}

/** The verdict from the odds and the implied value, with the single decisive reason. */
export function verdictFor(odds: number, implied: number, model: ModelConstants): { verdict: 'Farm now' | 'Watch' | 'Skip'; reason: string } {
  const valueM = Math.round(implied / 1e6);
  if (odds >= model.farm_now_odds && implied >= model.farm_now_value) {
    return { verdict: 'Farm now', reason: `launch odds ${(odds * 100).toFixed(0)}% and implied value $${valueM}M clear both bars` };
  }
  if (odds >= model.watch_odds || implied >= model.watch_value) {
    const why = odds >= model.watch_odds ? `launch odds ${(odds * 100).toFixed(0)}% clear the watch bar` : `implied value $${valueM}M clear the watch bar`;
    return { verdict: 'Watch', reason: why };
  }
  return { verdict: 'Skip', reason: `launch odds ${(odds * 100).toFixed(0)}% and implied value $${valueM}M clear neither bar` };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. Every rankable protocol, at any TVL. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fitted = fitModel(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every pre-token protocol that passes the house's own exclusion rule, at any
  // TVL — the watchlist is the floor, never the ceiling. A chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fitted);
    const o = oddsFor(p, v.age, fitted);
    const verdict = verdictFor(o.odds, v.implied, model);
    return { p, ...v, ...o, ...verdict };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const totalImplied = scored.reduce((n, s) => n + s.implied, 0);
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_low_usd: s.impliedLow,
    implied_high_usd: s.impliedHigh,
    implied_share: Math.round((s.implied / Math.max(1, totalImplied)) * 1e6) / 1e6,
    token_odds: s.odds,
    verdict: s.verdict,
    verdict_reason: s.reason,
    model: {
      multiple: Math.round(s.multiple * 1e4) / 1e4,
      multiple_peers: s.peers,
      category_median: Math.round(s.categoryMedian * 1e4) / 1e4,
      peer_p25: Math.round(s.peerP25 * 1e4) / 1e4,
      peer_p75: Math.round(s.peerP75 * 1e4) / 1e4,
      growth_pct: s.growthPct,
      growth_multiplier: Math.round(s.growthMult * 1e4) / 1e4,
      maturity_multiplier: Math.round(s.maturityMult * 1e4) / 1e4,
      age_days: s.age,
      category_launch_rate: s.catRate,
      age_band_launch_rate: s.ageRate,
    },
    farm_steps: farmSteps(s.p, s.age, s.verdict).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas profile of a chain, as the farm plan states it: L1s cost dollars, L2s cents, Solana a cent. */
function gasFor(chain: string): { perTx: string; weekly: string; perTxUsd: number; weeklyUsd: number } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { perTx: '$2–$15 of gas', weekly: 'about $5 of gas a week', perTxUsd: 8, weeklyUsd: 5 };
  if (c === 'solana') return { perTx: 'about $0.01 of gas', weekly: 'about $0.05 of gas a week', perTxUsd: 0.01, weeklyUsd: 0.05 };
  if (c === 'arbitrum' || c === 'optimism' || c === 'base' || c === 'zksync' || c === 'linea' || c === 'scroll' || c === 'blast' || c === 'mode') {
    return { perTx: 'about $0.05–$0.50 of gas', weekly: 'about $0.20 of gas a week', perTxUsd: 0.25, weeklyUsd: 0.2 };
  }
  return { perTx: 'about $0.10–$2 of gas', weekly: 'about $1 of gas a week', perTxUsd: 1, weeklyUsd: 1 };
}

/** The minimum viable capital for one farm position: the category's floor, scaled by the protocol's TVL band. */
function capitalFor(p: SnapshotProtocol): number {
  const c = (p.category ?? '').toLowerCase();
  let base = 50;
  if (c.includes('perpetual') || c.includes('derivative')) base = 100;
  else if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) base = 100;
  else if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) base = 100;
  else if (c.includes('stable')) base = 100;
  else if (c.includes('rwa')) base = 100;
  else if (c.includes('insurance')) base = 100;
  else if (c.includes('prediction')) base = 25;
  else if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) base = 50;
  else if (c.includes('bridge')) base = 50;
  else if (c.includes('staking') || c.includes('restak')) base = 50;
  const mult = p.tvl_usd >= 5_000_000_000 ? 2.5 : p.tvl_usd >= 1_000_000_000 ? 2 : p.tvl_usd >= 100_000_000 ? 1.5 : 1;
  const raw = Math.round((base * mult) / 10) * 10;
  return Math.min(2000, Math.max(50, raw));
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name}, open one small hedge, and close it before the funding window ends.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, borrow a small amount against it once, and repay it the same week.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, both sides, and keep the position in range.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then leave it to settle.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares until the vault's next epoch.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it for the full distribution period.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the cover period.`;
  if (c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares until the vault's next epoch.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, varied by category so the plan is not one generic set. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('perpetual') || c.includes('derivative')) return `Make one qualifying action each week: adjust the hedge, close and reopen the position, or vote on a market proposal.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Make one qualifying action each week: top up the supply, adjust the borrow, or vote in governance.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Make one qualifying action each week: rebalance the range, add a small amount, or claim and restake the fees.`;
  if (c.includes('prediction')) return `Make one qualifying action each week: place a new market position or add to an open one.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Make one qualifying action each week: add a small deposit to the vault or vote on a curator proposal.`;
  return `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`;
}

/** The one-line risk note for the plan, by category: the principal risk the farmer takes. */
function riskNoteFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('perpetual') || c.includes('derivative')) return `Risk: the margin can be liquidated if the hedge moves against you; points are not guaranteed and the principal can fall.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Risk: a sharp price move can liquidate the borrow; smart-contract risk on ${chain}; points are not guaranteed.`;
  if (c.includes('bridge')) return `Risk: bridge risk — funds can be delayed or lost if the bridge is exploited; points are not guaranteed.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Risk: impermanent loss if the pair moves; smart-contract risk on ${chain}; points are not guaranteed.`;
  if (c.includes('staking') || c.includes('restak')) return `Risk: slashing and smart-contract risk on ${chain}; the staked asset's price can fall; points are not guaranteed.`;
  if (c.includes('stable')) return `Risk: depeg risk — the stable asset can trade below its peg; smart-contract risk on ${chain}.`;
  if (c.includes('rwa')) return `Risk: the underlying real-world asset can default; smart-contract risk on ${chain}; points are not guaranteed.`;
  return `Risk: smart-contract risk on ${chain}; points are not guaranteed and the principal can fall if the protocol is exploited.`;
}

/**
 * A protocol's farm plan: the verdict, a fresh wallet, a bridge step when the main chain is not
 * Ethereum, the category's action, a weekly qualifying action, the hold, the claim-safety step, a
 * risk note and a cost summary in $/hour. The plan is derived from the protocol's own record
 * (category, chains, TVL, age, verdict), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, verdict: 'Farm now' | 'Watch' | 'Skip'): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const first =
    verdict === 'Farm now'
      ? `Start this one now: the model rates it Farm now, so open the position this week while the window is open.`
      : verdict === 'Watch'
        ? `Watch this one first: open a small position to learn the app, and scale it up only if the protocol ships a points program.`
        : `Do not chase this one: the model rates it Skip, so keep the position tiny or wait for a points program before committing funds.`;
  const steps: FarmStep[] = [
    { text: first, cost: 'nothing to decide yet', time: '5 minutes' },
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
  ];
  if (chain.toLowerCase() !== 'ethereum') {
    steps.push({
      text: `Bridge $${capital} of USDC from Ethereum to ${chain} through the chain's canonical bridge before you start.`,
      cost: 'about $5–$15 of bridge gas',
      time: '10 minutes',
    });
  }
  steps.push(
    { text: action, cost: `$${capital} of capital and ${gas.perTx}`, time: '15 minutes to set up' },
    {
      text: weeklyActionFor(p),
      cost: gas.weekly,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: riskNoteFor(p, chain),
      cost: 'the principal is at risk',
      time: 'read before you deposit',
    },
  );
  // Cost summary: gas for the setup and one week of qualifying actions, per hour of attention.
  const setupGas = gas.perTxUsd + 3;
  const weeklyGas = gas.weeklyUsd;
  const weeklyMinutes = 10;
  const perHour = weeklyGas > 0 ? Math.round((weeklyGas / (weeklyMinutes / 60)) * 100) / 100 : 0;
  const totalLow = Math.round((setupGas + weeklyGas) * 100) / 100;
  const totalHigh = Math.round((setupGas + weeklyGas * 4) * 100) / 100;
  steps.push({
    text: `Total cost about $${totalLow}–$${totalHigh} of gas for the first month, for about ${weeklyMinutes} minutes a week of attention — roughly $${perHour} an hour of attention.`,
    cost: `about $${totalLow}–$${totalHigh} of gas`,
    time: `about ${weeklyMinutes} minutes a week`,
  });
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    implied_share: row.implied_share,
    token_odds: row.token_odds,
    verdict: row.verdict,
    verdict_reason: row.verdict_reason,
    watchlist: watchlist.has(row.slug),
    multiple: row.model.multiple,
    multiple_peers: row.model.multiple_peers,
    category_median: row.model.category_median,
    peer_p25: row.model.peer_p25,
    peer_p75: row.model.peer_p75,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_launch_rate: row.model.category_launch_rate,
    age_band_launch_rate: row.model.age_band_launch_rate,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; fitted: Fitted } {
  const fitted = fitModel(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fitted: {
      global_multiple: round4(fitted.globalMultiple),
      peer_count: fitted.peerCount,
      median_age_days: fitted.medianAge,
      global_launch_rate: round4(fitted.globalLaunchRate),
      age_band_launch_rate: fitted.ageBandLaunchRate.map(round4),
      heldout_median_error_pct: round4(fitted.heldoutMedianError * 100),
      heldout_p75_error_pct: round4(fitted.heldoutP75Error * 100),
      heldout_n: fitted.heldoutN,
      ablation: fitted.ablation,
      calibration: fitted.calibration,
      coverage: fitted.coverage,
    },
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar, fitted };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.implied_low_usd) || r.implied_low_usd <= 0) return `${r.slug} has implied low ${r.implied_low_usd}`;
    if (!Number.isSafeInteger(r.implied_high_usd) || r.implied_high_usd < r.implied_value_usd) return `${r.slug} has implied high ${r.implied_high_usd}`;
    if (r.token_odds < 0 || r.token_odds > 1) return `${r.slug} has token odds ${r.token_odds}`;
    if (r.verdict !== 'Farm now' && r.verdict !== 'Watch' && r.verdict !== 'Skip') return `${r.slug} has verdict ${r.verdict}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
