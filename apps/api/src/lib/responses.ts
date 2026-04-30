import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export class ApiError extends HTTPException {
  constructor(
    status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503,
    message: string
  ) {
    super(status, { message });
  }
}

export function ok<T>(data: T) {
  return { ok: true as const, data };
}

export function paginate(total: number, page: number, limit: number) {
  const total_pages = Math.max(1, Math.ceil(total / limit));
  return {
    current_page: page,
    total_pages,
    total_items: total,
    items_per_page: limit,
    has_next: page < total_pages,
    has_prev: page > 1,
  };
}

export async function readJson<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

export function sha256Hex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
}
