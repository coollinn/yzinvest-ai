import type { AIProvider, AIProviderConfig } from "./types";

/**
 * Anthropic (Claude) API Provider
 * Docs: https://docs.anthropic.com/claude/reference/messages_post
 */
export class AnthropicProvider implements AIProvider {
  constructor(private config: AIProviderConfig) {}

  async generateReport(prompt: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? "claude-sonnet-4-6-20251022",
        max_tokens: this.config.maxTokens ?? 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return json.content?.[0]?.text ?? "";
  }
}
