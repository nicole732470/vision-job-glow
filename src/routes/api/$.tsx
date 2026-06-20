import { createFileRoute } from "@tanstack/react-router";

const BACKEND = (
  process.env.JOBLENS_API_URL ??
  process.env.VITE_API_URL ??
  "http://3.128.164.130:8000"
).replace(/\/$/, "");

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

  return fetch(target, init);
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
