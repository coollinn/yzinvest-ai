import { ofetch, type FetchOptions } from "ofetch";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}
interface ApiError {
  ok: false;
  error: { code: string; message: string; issues?: unknown };
}
type ApiResponse<T> = ApiSuccess<T> | ApiError;

class ApiException extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: unknown
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler;
}

let getAccessToken: (() => string | null) | null = null;
export function setTokenProvider(fn: () => string | null) {
  getAccessToken = fn;
}

export const api = ofetch.create({
  baseURL: API_BASE,
  retry: 0,
  onRequest({ options }) {
    const token = getAccessToken?.();
    if (token) {
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${token}`);
      options.headers = headers;
    }
  },
  async onResponseError({ response }) {
    const body = response._data as ApiError | undefined;
    if (response.status === 401) {
      onUnauthorized?.();
    }
    throw new ApiException(
      response.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? response.statusText,
      body?.error?.issues
    );
  },
});

export async function apiGet<T>(path: string, options?: FetchOptions): Promise<T> {
  const r = (await api(path, { method: "GET", ...options })) as ApiResponse<T>;
  if (!r.ok) throw new ApiException(0, r.error.code, r.error.message, r.error.issues);
  return r.data;
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: FetchOptions
): Promise<T> {
  const r = (await api(path, {
    method: "POST",
    body: body as never,
    ...options,
  })) as ApiResponse<T>;
  if (!r.ok) throw new ApiException(0, r.error.code, r.error.message, r.error.issues);
  return r.data;
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  options?: FetchOptions
): Promise<T> {
  const r = (await api(path, {
    method: "PUT",
    body: body as never,
    ...options,
  })) as ApiResponse<T>;
  if (!r.ok) throw new ApiException(0, r.error.code, r.error.message, r.error.issues);
  return r.data;
}

export async function apiDelete<T>(path: string, options?: FetchOptions): Promise<T> {
  const r = (await api(path, { method: "DELETE", ...options })) as ApiResponse<T>;
  if (!r.ok) throw new ApiException(0, r.error.code, r.error.message, r.error.issues);
  return r.data;
}

export { ApiException };
