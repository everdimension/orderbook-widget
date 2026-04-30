const sizeFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const totalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 5,
  maximumFractionDigits: 5,
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
