/** Money is stored as integer minor units + a currency code (spec §0.3). Format for display. */
const SYMBOL: Record<string, string> = { USD: "$", CAD: "$", EUR: "€", GBP: "£", AED: "د.إ" };

export function formatMinor(amountMinor: number, currency = "USD", opts: { compact?: boolean } = {}): string {
  const sym = SYMBOL[currency] ?? "$";
  const major = amountMinor / 100;
  if (opts.compact && Math.abs(major) >= 1000) {
    return `${sym}${(major / 1000).toFixed(1)}k`;
  }
  return `${sym}${major.toLocaleString("en-US", { minimumFractionDigits: major % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export { SYMBOL as currencySymbols };
