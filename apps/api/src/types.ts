export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  CORS_ORIGINS: string;
  JWT_SECRET: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: "user" | "admin";
}

export type Variables = {
  user?: AuthUser;
};
