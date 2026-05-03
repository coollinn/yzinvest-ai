import type { AIProvider, AIProviderConfig } from "./types";

/**
 * Custom OpenAI-compatible API Provider
 * 支持任何兼容 OpenAI API 格式的服务：
 *   - Ollama (本地模型)
 *   - vLLM
 *   - LM Studio
 *   - 其他第三方兼容接口
 *
 * 使用方式：
 *   AI_PROVIDER=custom
 *   CUSTOM_AI_BASE_URL=http://localhost:11434/v1
 *   CUSTOM_AI_API_KEY=your-key
 *   CUSTOM_AI_MODEL=llama3.1
 */
export class CustomProvider implements AIProvider {
  constructor(private config: AIProviderConfig) {}

  async generateReport(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl ?? "";
    if (!baseUrl) {
      throw new Error("CUSTOM_AI_BASE_URL is required for custom provider");
    }

    const url = baseUrl.endsWith("/chat/completions")
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/chat/completions`;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.model ?? "gpt-3.5-turbo",
        max_tokens: this.config.maxTokens ?? 2000,
        temperature: this.config.temperature ?? 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`Custom AI API error ${res.status}: ${err}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? "";
  }
}
