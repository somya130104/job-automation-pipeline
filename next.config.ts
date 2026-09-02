import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A lockfile in a parent directory makes Next guess the wrong workspace root.
  outputFileTracingRoot: __dirname,
  // pdf-parse and mammoth are CommonJS and read files off disk at require-time.
  // Bundling them breaks; keep them external to the server build.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
