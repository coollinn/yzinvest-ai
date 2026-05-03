import { AnthropicProvider } from "./anthropic";
import { CustomProvider } from "./custom";
import { DeepSeekProvider } from "./deepseek";
import { OpenAIProvider } from "./openai";
import { buildProviderConfig, type AIProvider, type AIProviderConfig, type AIProviderName } from "./types";

export { buildProviderConfig };
export type { AIProvider, AIProviderConfig, AIProviderName };

/**
 * 创建 AI Provider 实例
 * @param config provider 配置
 */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.name) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "deepseek":
      return new DeepSeekProvider(config);
    case "custom":
      return new CustomProvider(config);
    default:
      return new AnthropicProvider(config);
  }
}
