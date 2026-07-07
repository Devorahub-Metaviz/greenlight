import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desktop build (Tauri) bundles a minimal server + node_modules and runs it
  // as a sidecar; standalone output is what makes that bundle self-contained.
  output: "standalone",
};

export default nextConfig;
