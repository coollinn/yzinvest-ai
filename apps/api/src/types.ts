export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  CORS_ORIGINS: string;
  JWT_SECRET: string;
  // AI Provider 配置
  AI_PROVIDER?: string;           // anthropic | openai | deepseek | custom
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  CUSTOM_AI_BASE_URL?: string;
  CUSTOM_AI_API_KEY?: string;
  CUSTOM_AI_MODEL?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: "user" | "admin";
}

export type Variables = {
  user?: AuthUser;
};
