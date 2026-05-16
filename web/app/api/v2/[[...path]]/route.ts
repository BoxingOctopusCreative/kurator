import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set(
  [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
  ].map((s) => s.toLowerCase()),
);

/** Strip hop-by-hop / body framing headers when piping a decoded fetch body to the client. */
const STRIP_FROM_CLIENT = new Set(["content-encoding", "content-length"].map((s) => s.toLowerCase()));

function upstreamBase(): string {
  const raw =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.API_PROXY_TARGET?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://127.0.0.1:8080";
  return raw.replace(/\/$/, "");
}

function buildUpstreamUrl(pathSegments: string[] | undefined, search: string): string {
  const base = upstreamBase();
  const rest = pathSegments?.length ? pathSegments.join("/") : "";
  const pathname = rest ? `/api/v2/${rest}` : "/api/v2";
  return `${base}${pathname}${search}`;
}

function copyResponseHeaders(from: Headers, to: NextResponse): void {
  from.forEach((value, key) => {
    const kl = key.toLowerCase();
    if (HOP_BY_HOP.has(kl) || STRIP_FROM_CLIENT.has(kl)) return;
    to.headers.append(key, value);
  });
}

async function proxy(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  const target = buildUpstreamUrl(path, request.nextUrl.search);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.delete("host");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    console.error("api v2 proxy: upstream fetch failed", { target, err });
    return NextResponse.json(
      { error: "proxy_upstream_unreachable", message: "Could not reach API server." },
      { status: 502 },
    );
  }

  const out = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  });
  copyResponseHeaders(upstream.headers, out);
  return out;
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
