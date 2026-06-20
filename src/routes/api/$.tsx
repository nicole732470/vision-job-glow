import { createFileRoute } from "@tanstack/react-router";

const BACKEND = (
  process.env.JOBLENS_API_URL ??
  process.env.VITE_API_URL ??
  "https://3-128-164-130.sslip.io"
).replace(/\/$/, "");

const TIMEOUT_MS: Record<string, number> = {
  analyze: 120_000,
  "jobs/parse-url": 45_000,
};
const DEFAULT_TIMEOUT_MS = 30_000;

async function proxyHandler({
  request,
  params,
}: {
  request: Request;
  params: { _splat?: string };
}) {
  const splat = (params._splat ?? "").replace(/^\//, "");
  const incoming = new URL(request.url);
  const target = `${BACKEND}/${splat}${incoming.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const timeoutMs = TIMEOUT_MS[splat] ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(target, { ...init, signal: controller.signal });
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return new Response(
      JSON.stringify({
        detail: aborted
          ? "Upstream request timed out. Try the Chrome extension or paste the job manually."
          : String((e as Error)?.message || e),
      }),
      {
        status: aborted ? 504 : 502,
        headers: { "content-type": "application/json" },
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: proxyHandler,
      POST: proxyHandler,
      PUT: proxyHandler,
      PATCH: proxyHandler,
      DELETE: proxyHandler,
      OPTIONS: proxyHandler,
    },
  },
});
