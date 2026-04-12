import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['deso-protocol'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
