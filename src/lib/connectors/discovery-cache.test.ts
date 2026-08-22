import { describe, expect, it, beforeEach, vi } from "vitest";

// The real package throws when imported outside a Server Component (its
// exports map only serves the no-op empty.js under the "react-server"
// condition, which vitest doesn't set) — stub it so discovery-cache.ts's
// `import "server-only"` is a no-op here, same as any other test would need.
vi.mock("server-only", () => ({}));

const { listAccountsMocks } = vi.hoisted(() => ({
  listAccountsMocks: {
    lead_dashboard: vi.fn(),
    ghl: vi.fn(),
    google_ads: vi.fn(),
    meta: vi.fn(),
    ga4: vi.fn(),
    search_console: vi.fn(),
    ahrefs: vi.fn(),
    openphone: vi.fn(),
  },
}));

vi.mock("./registry", () => ({
  connectorRegistry: Object.fromEntries(
    Object.entries(listAccountsMocks).map(([platform, listAccounts]) => [platform, { platform, listAccounts }]),
  ),
}));

// Each test re-imports the module fresh (after vi.resetModules()) so the
// module-scope cache Map starts empty every time — otherwise a platform
// cached by an earlier test would silently mask what this test is trying
// to observe.
async function freshModule() {
  vi.resetModules();
  return import("./discovery-cache");
}

describe("discovery-cache", () => {
  beforeEach(() => {
    for (const mock of Object.values(listAccountsMocks)) mock.mockReset();
  });

  it("reuses the cached result within the TTL instead of calling the connector again", async () => {
    const { getDiscoveredAccounts } = await freshModule();
    listAccountsMocks.lead_dashboard.mockResolvedValue({ status: "ok", accounts: [{ id: "1", name: "Acme" }] });

    await getDiscoveredAccounts("lead_dashboard");
    await getDiscoveredAccounts("lead_dashboard");

    expect(listAccountsMocks.lead_dashboard).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cache when forceRefresh is set", async () => {
    const { getDiscoveredAccounts } = await freshModule();
    listAccountsMocks.lead_dashboard.mockResolvedValue({ status: "ok", accounts: [] });

    await getDiscoveredAccounts("lead_dashboard");
    await getDiscoveredAccounts("lead_dashboard", { forceRefresh: true });

    expect(listAccountsMocks.lead_dashboard).toHaveBeenCalledTimes(2);
  });

  it("caches per platform independently", async () => {
    const { getDiscoveredAccounts } = await freshModule();
    listAccountsMocks.lead_dashboard.mockResolvedValue({ status: "ok", accounts: [] });
    listAccountsMocks.ghl.mockResolvedValue({ status: "ok", accounts: [] });

    await getDiscoveredAccounts("lead_dashboard");
    await getDiscoveredAccounts("ghl");

    expect(listAccountsMocks.lead_dashboard).toHaveBeenCalledTimes(1);
    expect(listAccountsMocks.ghl).toHaveBeenCalledTimes(1);
  });

  it("one platform erroring doesn't block the others from loading", async () => {
    const { getAllDiscoveredAccounts } = await freshModule();
    listAccountsMocks.lead_dashboard.mockResolvedValue({ status: "ok", accounts: [{ id: "1", name: "Acme" }] });
    listAccountsMocks.ghl.mockRejectedValue(new Error("boom"));
    listAccountsMocks.google_ads.mockResolvedValue({ status: "ok", accounts: [] });
    listAccountsMocks.meta.mockResolvedValue({ status: "ok", accounts: [] });
    listAccountsMocks.ga4.mockResolvedValue({ status: "ok", accounts: [] });
    listAccountsMocks.search_console.mockResolvedValue({ status: "ok", accounts: [] });
    listAccountsMocks.ahrefs.mockResolvedValue({ status: "ok", accounts: [] });
    listAccountsMocks.openphone.mockResolvedValue({ status: "ok", accounts: [] });

    const results = await getAllDiscoveredAccounts();

    expect(results).toHaveLength(8);
    const leadDashboard = results.find((r) => r.platform === "lead_dashboard");
    const ghl = results.find((r) => r.platform === "ghl");
    expect(leadDashboard?.result.status).toBe("ok");
    expect(ghl?.result.status).toBe("error");
  });
});
