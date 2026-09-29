import type { NextConfig } from "next";

// APP_DOMAIN e.g. "apris.se.dsu.edu.pk" — lets Server Actions accept requests forwarded by nginx.
const domain = process.env.APP_DOMAIN;
const prod = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Non-script directives only (no nonce plumbing needed): blocks framing, plugin content, base-tag and cross-site form posts.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "@prisma/client", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "12mb", ...(domain ? { allowedOrigins: [domain] } : {}) } },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
