/**
 * AI Provider 统一接口
 * 所有 provider 必须实现此接口
 */
export interface AIProvider {
  /** 生成研报 */
  generateReport(prompt: string): Promise<string>;
}

export type AIProviderName = "kimi" | "anthropic" | "openai" | "deepseek" | "custom";

export interface AIProviderConfig {
  name: AIProviderName;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/** 从 Env 构建 provider 配置 */
export function buildProviderConfig(env: {
  AI_PROVIDER?: string;
  KIMI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  CUSTOM_AI_BASE_URL?: string;
  CUSTOM_AI_API_KEY?: string;
  CUSTOM_AI_MODEL?: string;
}): AIProviderConfig {
  const provider = (env.AI_PROVIDER ?? "kimi") as AIProviderName;

  switch (provider) {
    case "kimi":
      return {
        name: "kimi",
        apiKey: env.KIMI_API_KEY ?? "",
        baseUrl: "https://api.kimi.com/coding/v1",
        model: "kimi-for-coding",
        maxTokens: 8000,
      };
    case "anthropic":
      return {
        name: "anthropic",
        apiKey: env.ANTHROPIC_API_KEY ?? "",
        model: "claude-sonnet-4-6-20251022",
        maxTokens: 2000,
      };
    case "openai":
      return {
        name: "openai",
        apiKey: env.OPENAI_API_KEY ?? "",
        model: "gpt-4o",
        maxTokens: 2000,
      };
    case "deepseek":
      return {
        name: "deepseek",
        apiKey: env.DEEPSEEK_API_KEY ?? "",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        maxTokens: 2000,
      };
    case "custom":
      return {
        name: "custom",
        apiKey: env.CUSTOM_AI_API_KEY ?? "",
        baseUrl: env.CUSTOM_AI_BASE_URL ?? "",
        model: env.CUSTOM_AI_MODEL ?? "gpt-3.5-turbo",
        maxTokens: 2000,
      };
    default:
      return {
        name: "kimi",
        apiKey: env.KIMI_API_KEY ?? "",
        baseUrl: "https://api.kimi.com/coding/v1",
        model: "kimi-for-coding",
        maxTokens: 8000,
      };
  }
}
