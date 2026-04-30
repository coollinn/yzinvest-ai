export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  CORS_ORIGINS: string;
  TUSHARE_TOKEN: string;
  JWT_SECRET: string;
  CNINFO_COOKIE: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: "user" | "admin";
}

export type Variables = {
  user?: AuthUser;
};
