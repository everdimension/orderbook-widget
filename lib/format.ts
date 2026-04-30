const sizeFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const totalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const spreadAbsFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const spreadPctFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function formatPrice(pxStr: string): string {
  // Preserve API-canonical decimals; just add thousands separators.
  const [whole, frac] = pxStr.split(".");
  const wholeNum = parseInt(whole, 10);
  const wholeFmt = Number.isFinite(wholeNum)
    ? wholeNum.toLocaleString("en-US")
    : whole;
  return frac !== undefined ? `${wholeFmt}.${frac}` : wholeFmt;
}

export function formatSize(sz: number): string {
  return sizeFormatter.format(sz);
}

export function formatTotal(total: number): string {
  return totalFormatter.format(total);
}

export function formatSpreadAbs(spread: number): string {
  return spreadAbsFormatter.format(spread);
}

export function formatSpreadPct(pct: number): string {
  return `${spreadPctFormatter.format(pct)}%`;
}

/**
 * The Hyperliquid nSigFigs parameter rounds prices to N significant figures,
 * which produces a tick size of 10^(integerDigits - N) at the reference price.
 *
 * E.g. BTC at ~$75k, nSigFigs=5 → 10^(5-5) = $1 buckets.
 *      ETH at ~$3.5k, nSigFigs=5 → 10^(4-5) = $0.10 buckets.
 */
export function tickSizeForNSigFigs(
  refPrice: number,
  nSigFigs: number,
): number {
  if (!Number.isFinite(refPrice) || refPrice <= 0) return 0;
  const integerDigits = Math.floor(Math.log10(refPrice)) + 1;
  return Math.pow(10, integerDigits - nSigFigs);
}

export function formatTickSize(tick: number): string {
  if (!Number.isFinite(tick) || tick <= 0) return "";
  if (tick >= 1) {
    return `$${tick.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  // Sub-dollar tick: render with just enough decimals to display it.
  const decimals = Math.max(0, -Math.floor(Math.log10(tick)));
  return `$${tick.toFixed(decimals)}`;
}
