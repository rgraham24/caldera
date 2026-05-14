import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: blob: node.deso.org images.deso.org *.deso.org; connect-src 'self' wss: *.deso.org node.deso.org api.kraken.com *.supabase.co; frame-ancestors 'none';",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["deso-protocol"],
  turbopack: {
    root: __dirname,
  },
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "@heroicons/react"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // Apex -> www canonical redirect. Vercel's default apex handling
  // emits a 308 with BOTH Location: AND Refresh: headers, which iOS
  // Safari / mobile WebKit aborts with "Page couldn't load". A 301
  // emits a single Location header and is what mobile expects.
  // (Next's Redirect type treats `permanent` and `statusCode` as
  // mutually exclusive — using statusCode alone here.)
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "caldera.market",
          },
        ],
        destination: "https://www.caldera.market/:path*",
        statusCode: 301,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
