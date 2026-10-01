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

// One decimal only where it's meaningful: "+4.2%" but "+900%", not "+900.0%".
export function formatPercent(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`;
}

export function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (Math.abs(diffHours) < 1) {
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    // Intl says "this minute"; "just now" reads better.
    if (diffMinutes === 0) return "just now";
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }
  if (Math.abs(diffHours) < 48) {
    return relativeTimeFormatter.format(Math.round(diffHours), "hour");
  }
  return relativeTimeFormatter.format(Math.round(diffHours / 24), "day");
}

// Table-width version of formatRelativeTime: "23m ago", "11h ago", "3d ago".
export function formatRelativeTimeShort(date: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
