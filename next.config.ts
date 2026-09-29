import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev/test server can run beside the main one by giving it its own build directory.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // PGlite loads its WASM/data files relative to its own module; bundling breaks that.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    // Field photos go through a server action; lib/storage.ts caps them at 10 MB.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
