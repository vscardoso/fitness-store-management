import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http",  hostname: "**" },
    ],
  },

  // Redirecionar www → sem www (URL canônica)
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.wamodafitness.com.br" }],
        destination: "https://wamodafitness.com.br/:path*",
        permanent: true,
      },
    ];
  },

  // Headers de segurança e SEO
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
