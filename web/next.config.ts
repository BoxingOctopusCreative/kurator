import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  images: {
    // Self-hosted (e.g. Docker + Traefik/Cloudflare): serve remote `src` URLs as-is instead of
    // `/_next/image?...`, which often 400s without a working sharp stack, with very long Unsplash
    // query strings, or when an edge proxy limits the optimizer request.
    unoptimized: true,
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
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  widenClientFileUpload: true,

  tunnelRoute: "/monitoring",

  silent: !process.env.CI,
});
