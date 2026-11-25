import { vi } from "vitest";

export interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
  /** Parsed JSON for JSON bodies, the FormData for uploads, undefined when empty. */
  body: unknown;
}

type Reply = Response | Promise<Response>;
/** A canned body (sent as 200 JSON) or a function that builds the response. */
export type RouteHandler = ((call: RecordedCall) => Reply) | object;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, status);
}

function readBody(body: RequestInit["body"]): unknown {
  if (typeof body === "string") return JSON.parse(body);
  return body ?? undefined;
}

/**
 * Stubs global fetch with a tiny router keyed by "METHOD /path". Unknown routes return a
 * 404 `{ error }`, so a missing mock shows up as a banner message in assertions.
 */
export function mockApi(initial: Record<string, RouteHandler> = {}) {
  const routes = new Map(Object.entries(initial));
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const call: RecordedCall = {
        method: (init.method ?? "GET").toUpperCase(),
        path,
        headers: new Headers(init.headers),
        body: readBody(init.body),
      };
      calls.push(call);
      const handler = routes.get(`${call.method} ${path}`);
      if (handler === undefined) {
        return errorResponse(404, `No mock for ${call.method} ${path}`);
      }
      return typeof handler === "function"
        ? (handler as (call: RecordedCall) => Reply)(call)
        : jsonResponse(handler);
    },
  );

  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    calls,
    /** Replace or add a route mid-test (e.g. the list after a claim). */
    set(key: string, handler: RouteHandler) {
      routes.set(key, handler);
    },
    callsTo(key: string): RecordedCall[] {
      return calls.filter((call) => `${call.method} ${call.path}` === key);
    },
  };
}

export type ApiMock = ReturnType<typeof mockApi>;
