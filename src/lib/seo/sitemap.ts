export type SitemapResult =
  | { status: "ok"; urls: string[] }
  | { status: "no_data" }
  | { status: "error"; error: string };

const FETCH_TIMEOUT_MS = 8000;
const MAX_URLS = 300;
const MAX_CHILD_SITEMAPS = 3;

// The robots.txt directive and sitemap-index entries are URLs written by a
// client's website, and this runs on our server — only follow public
// http(s) addresses, never localhost, private ranges or cloud metadata.
function isSafePublicUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host.includes(":")) return false; // IPv6 literals (::1, fc00::/7, …) — sitemaps don't need them
  return true;
}

async function fetchText(url: string): Promise<string | null> {
  if (!isSafePublicUrl(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "civsav-seo-dashboard/1.0" } });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// A sitemap (and a sitemap index) is a very regular, well-known format —
// a full XML parser is more machinery than extracting <loc> tags needs,
// and this feeds an AI prompt for context, not anything structural.
// Handles <![CDATA[...]]>-wrapped locations (common from WordPress
// plugins) and XML-escaped ampersands in query strings.
function extractLocs(xml: string): string[] {
  const matches = xml.matchAll(/<loc>\s*(?:<!\[CDATA\[\s*)?([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi);
  return Array.from(matches, (m) =>
    m[1].replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
  );
}

// Index files often list image, video, tag and author sitemaps first; the
// pages and posts are what's useful as context, so read those first and
// skip gzipped children (fetch().text() can't read them).
function rankChildSitemaps(urls: string[]): string[] {
  const score = (url: string) => {
    const u = url.toLowerCase();
    if (/(image|video|news|tag|author|category|attachment)/.test(u)) return 2;
    if (/(page|post|product|service|location)/.test(u)) return 0;
    return 1;
  };
  return urls.filter((u) => !u.toLowerCase().endsWith(".gz")).sort((a, b) => score(a) - score(b));
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

// robots.txt's "Sitemap: <url>" directive, tried when /sitemap.xml itself
// 404s — some sites only publish the location there.
function extractSitemapDirective(robotsTxt: string): string | null {
  const match = robotsTxt.match(/^\s*Sitemap:\s*(\S+)/im);
  return match ? match[1] : null;
}

export async function fetchSitemapUrls(domain: string): Promise<SitemapResult> {
  // Ahrefs targets can carry a path or wildcard ("example.com/blog",
  // "*.example.com") — the sitemap lives at the host root.
  const bareDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^\*\./, "")
    .split("/")[0];

  let xml = await fetchText(`https://${bareDomain}/sitemap.xml`);

  if (!xml) {
    const robots = await fetchText(`https://${bareDomain}/robots.txt`);
    const directive = robots ? extractSitemapDirective(robots) : null;
    if (directive) xml = await fetchText(directive);
  }

  // Some sites only answer on www. (the bare domain doesn't resolve or
  // doesn't redirect).
  if (!xml && !bareDomain.startsWith("www.")) {
    xml = await fetchText(`https://www.${bareDomain}/sitemap.xml`);
  }
  if (!xml) return { status: "no_data" };

  try {
    if (isSitemapIndex(xml)) {
      const childUrls = rankChildSitemaps(extractLocs(xml)).slice(0, MAX_CHILD_SITEMAPS);
      const urls: string[] = [];
      for (const childUrl of childUrls) {
        const childXml = await fetchText(childUrl);
        if (childXml) urls.push(...extractLocs(childXml));
        if (urls.length >= MAX_URLS) break;
      }
      if (urls.length === 0) return { status: "no_data" };
      return { status: "ok", urls: urls.slice(0, MAX_URLS) };
    }

    const urls = extractLocs(xml);
    if (urls.length === 0) return { status: "no_data" };
    return { status: "ok", urls: urls.slice(0, MAX_URLS) };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
