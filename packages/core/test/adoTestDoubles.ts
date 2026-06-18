import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

export function mockJson(value: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
