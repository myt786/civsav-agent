import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a wasm binary and reads it from the filesystem relative to
  // its own module — bundling it through webpack breaks that path
  // resolution, so it needs to run as a plain Node require instead.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // The build's webpack compile started OOM-killing on Vercel's 4-core/8GB
    // build machine right after adding the `ai` SDK (large export surface,
    // several new client bundles) — these two flags are Next's own knobs
    // for lowering webpack's peak memory during that compile step, at some
    // cost to build speed.
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
  },
};

export default nextConfig;
