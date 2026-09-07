import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a wasm binary and reads it from the filesystem relative to
  // its own module — bundling it through webpack breaks that path
  // resolution, so it needs to run as a plain Node require instead.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // The build's webpack compile started OOM-killing on Vercel's 4-core/8GB
    // build machine right after adding the `ai` SDK. webpackMemoryOptimizations
    // is Next's own knob for lowering webpack-sources' string-buffer memory.
    // webpackBuildWorker (moving compilation into a second process) made no
    // difference in practice, so it isn't worth the extra process overhead.
    webpackMemoryOptimizations: true,
  },
  webpack: (config) => {
    // Next's default production build persists the entire module graph to a
    // filesystem cache (webpack-config.js sets `cache: { type: 'filesystem' }`
    // unconditionally). Serializing that graph is a well-known large memory
    // consumer in webpack production builds. Costs some build speed (nothing
    // to restore from between deploys) in exchange for a lower peak.
    config.cache = false;
    return config;
  },
};

export default nextConfig;
