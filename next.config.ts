import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a wasm binary and reads it from the filesystem relative to
  // its own module — bundling it through webpack breaks that path
  // resolution, so it needs to run as a plain Node require instead.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
