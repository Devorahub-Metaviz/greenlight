import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desktop build (Tauri) bundles a minimal server + node_modules and runs it
  // as a sidecar; standalone output is what makes that bundle self-contained.
  output: "standalone",
  // src-tauri/resources/app is itself a copy of this standalone output. Without
  // this exclusion, file tracing picks up a previous build's copy and nests it
  // inside the next one - compounding into an exponentially deep, unbundlable
  // tree after a couple of local rebuilds.
  outputFileTracingExcludes: {
    "*": ["./src-tauri/**"],
  },
};

export default nextConfig;
