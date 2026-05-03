export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  CORS_ORIGINS: string;
  JWT_SECRET: string;
  // AI Provider 配置（默认 kimi）
  AI_PROVIDER?: string;           // kimi | anthropic | openai | deepseek | custom
  KIMI_API_KEY?: string;
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
