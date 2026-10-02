import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchSitemapUrls } from "./sitemap";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function textResponse(status: number, body: string) {
  return { ok: status < 400, status, text: async () => body } as Response;
}

describe("fetchSitemapUrls", () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.useRealTimers());

  it("extracts urls from a plain sitemap", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(
        200,
        `<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`,
      ),
    );

    const result = await fetchSitemapUrls("example.com");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.urls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/sitemap.xml");
  });

  it("follows a sitemap index into its child sitemaps", async () => {
    fetchMock
      .mockResolvedValueOnce(
        textResponse(
          200,
          `<sitemapindex><sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap></sitemapindex>`,
        ),
      )
      .mockResolvedValueOnce(
        textResponse(200, `<urlset><url><loc>https://example.com/a</loc></url></urlset>`),
      );

    const result = await fetchSitemapUrls("example.com");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.urls).toEqual(["https://example.com/a"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to robots.txt's Sitemap directive when /sitemap.xml 404s", async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(404, ""))
      .mockResolvedValueOnce(textResponse(200, "User-agent: *\nSitemap: https://example.com/custom-sitemap.xml\n"))
      .mockResolvedValueOnce(textResponse(200, `<urlset><url><loc>https://example.com/a</loc></url></urlset>`));

    const result = await fetchSitemapUrls("example.com");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.urls).toEqual(["https://example.com/a"]);
    expect(fetchMock.mock.calls[2][0]).toBe("https://example.com/custom-sitemap.xml");
  });

  it("returns no_data when neither sitemap.xml nor robots.txt yields anything", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(404, "")).mockResolvedValueOnce(textResponse(404, ""));

    const result = await fetchSitemapUrls("example.com");

    expect(result.status).toBe("no_data");
  });

  it("returns no_data (not an error) on a malformed/non-sitemap response", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, "<html><body>not a sitemap</body></html>"));

    const result = await fetchSitemapUrls("example.com");

    expect(result.status).toBe("no_data");
  });

  it("strips a scheme/trailing slash from the domain before building the URL", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, `<urlset><url><loc>https://example.com/a</loc></url></urlset>`));

    await fetchSitemapUrls("https://example.com/");

    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/sitemap.xml");
  });

  it("reads CDATA-wrapped and XML-escaped locations", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(
        200,
        `<urlset><url><loc><![CDATA[https://example.com/a]]></loc></url><url><loc>https://example.com/b?x=1&amp;y=2</loc></url></urlset>`,
      ),
    );

    const result = await fetchSitemapUrls("example.com");

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.urls).toEqual(["https://example.com/a", "https://example.com/b?x=1&y=2"]);
  });

  it("never follows a robots.txt directive to a private address", async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(404, ""))
      .mockResolvedValueOnce(textResponse(200, "Sitemap: http://169.254.169.254/latest/meta-data\n"))
      .mockResolvedValueOnce(textResponse(404, ""));

    const result = await fetchSitemapUrls("example.com");

    expect(result.status).toBe("no_data");
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain("http://169.254.169.254/latest/meta-data");
  });

  it("reads page sitemaps before image or tag sitemaps in an index", async () => {
    fetchMock
      .mockResolvedValueOnce(
        textResponse(
          200,
          `<sitemapindex><sitemap><loc>https://example.com/image-sitemap.xml</loc></sitemap><sitemap><loc>https://example.com/page-sitemap.xml</loc></sitemap></sitemapindex>`,
        ),
      )
      .mockResolvedValue(textResponse(200, `<urlset><url><loc>https://example.com/a</loc></url></urlset>`));

    await fetchSitemapUrls("example.com");

    expect(fetchMock.mock.calls[1][0]).toBe("https://example.com/page-sitemap.xml");
  });

  it("uses the host root for an Ahrefs target with a path or wildcard", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, `<urlset><url><loc>https://example.com/a</loc></url></urlset>`));

    await fetchSitemapUrls("*.example.com/blog");

    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/sitemap.xml");
  });
});
