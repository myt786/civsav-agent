import { Fragment } from "react";

const URL_RE = /https?:\/\/[^\s'"<>)]+[^\s'"<>).,;:!?]/g;

// Shows a URL as just its path ("/rentals/mineola-tx"), or the domain for a
// homepage — the full address is still the link target and the tooltip.
function shortLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    return path ? `${path}${parsed.search}` : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// AI-written text often quotes full page URLs, which are one unbreakable
// "word" and pushed cards and bubbles past their edges. This renders each
// URL as a short clickable link instead, and the wrapper lets any remaining
// long token wrap rather than overflow.
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    // Drop the quotes the model often wraps URLs in.
    if (parts.length > 0 && typeof parts[parts.length - 1] === "string") {
      parts[parts.length - 1] = (parts[parts.length - 1] as string).replace(/['"‘“]$/, "");
    }
    parts.push(
      <a
        key={index}
        href={match[0]}
        target="_blank"
        rel="noreferrer"
        title={match[0]}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        {shortLabel(match[0])}
      </a>,
    );
    last = index + match[0].length;
    if (/['"’”]/.test(text[last] ?? "")) last += 1;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <span className={`min-w-0 [overflow-wrap:anywhere] ${className ?? ""}`}>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </span>
  );
}

// For one-line previews (table cells): same short labels, plain text.
export function shortenUrls(text: string): string {
  return text.replace(URL_RE, (url) => shortLabel(url)).replace(/['"‘“](\/[^'"’”]*)['"’”]/g, "$1");
}
