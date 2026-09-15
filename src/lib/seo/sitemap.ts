export type SitemapResult =
  | { status: "ok"; urls: string[] }
  | { status: "no_data" }
  | { status: "error"; error: string };

const FETCH_TIMEOUT_MS = 8000;
const MAX_URLS = 300;
const MAX_CHILD_SITEMAPS = 3;

async function fetchText(url: string): Promise<string | null> {
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
function extractLocs(xml: string): string[] {
  const matches = xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi);
  return Array.from(matches, (m) => m[1]);
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
  const bareDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  let xml = await fetchText(`https://${bareDomain}/sitemap.xml`);

  if (!xml) {
    const robots = await fetchText(`https://${bareDomain}/robots.txt`);
    const directive = robots ? extractSitemapDirective(robots) : null;
    if (!directive) return { status: "no_data" };
    xml = await fetchText(directive);
    if (!xml) return { status: "no_data" };
  }

  try {
    if (isSitemapIndex(xml)) {
      const childUrls = extractLocs(xml).slice(0, MAX_CHILD_SITEMAPS);
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
