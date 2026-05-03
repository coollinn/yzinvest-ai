import type { AIProvider, AIProviderConfig } from "./types";

/**
 * DeepSeek API Provider
 * Docs: https://platform.deepseek.com/api-docs/
 */
export class DeepSeekProvider implements AIProvider {
  constructor(private config: AIProviderConfig) {}

  async generateReport(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl ?? "https://api.deepseek.com";
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? "deepseek-chat",
        max_tokens: this.config.maxTokens ?? 2000,
        temperature: this.config.temperature ?? 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`DeepSeek API error ${res.status}: ${err}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? "";
  }
}
