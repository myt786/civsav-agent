const integerFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatPosition(value: number): string {
  return value.toFixed(1);
}

export function formatPercent(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (Math.abs(diffHours) < 1) {
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }
  if (Math.abs(diffHours) < 48) {
    return relativeTimeFormatter.format(Math.round(diffHours), "hour");
  }
  return relativeTimeFormatter.format(Math.round(diffHours / 24), "day");
}
