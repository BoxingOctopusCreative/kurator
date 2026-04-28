import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const apiProxy =
  process.env.API_PROXY_TARGET ?? process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.kuratorapp.cc",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "userassets.kuratorapp.cc",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxy.replace(/\/$/, "")}/api/v1/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  widenClientFileUpload: true,

  tunnelRoute: "/monitoring",

  silent: !process.env.CI,
});
