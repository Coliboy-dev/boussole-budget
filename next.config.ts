import { randomUUID } from "node:crypto";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A new production build installs a matching set of offline pages and assets.
  env: { NEXT_PUBLIC_OFFLINE_BUILD: randomUUID() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders, { key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/service-worker.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
