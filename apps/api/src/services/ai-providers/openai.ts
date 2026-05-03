import type { AIProvider, AIProviderConfig } from "./types";

/**
 * OpenAI API Provider (GPT-4 / GPT-4o / GPT-3.5)
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
export class OpenAIProvider implements AIProvider {
  constructor(private config: AIProviderConfig) {}

  async generateReport(prompt: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? "gpt-4o",
        max_tokens: this.config.maxTokens ?? 2000,
        temperature: this.config.temperature ?? 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? "";
  }
}
