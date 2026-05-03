import type { AIProvider, AIProviderConfig } from "./types";

/**
 * Kimi for Coding API Provider
 * OpenAI 兼容接口，但需要特殊的 Coding Agent 请求头
 *
 * Base URL: https://api.kimi.com/coding/v1
 * Model:    kimi-for-coding
 *
 * 必需 Header（缺少会 403）：
 *   - HTTP-Referer: https://github.com/RooVetGit/Roo-Cline
 *   - X-Title:      Roo Code
 *   - User-Agent:   RooCode/3.14.0
 *
 * 响应特点：
 *   - 包含 reasoning_content（思考过程）和 content（正式回答）
 *   - SSE 格式为 data:{...}（data: 后无空格）
 */
export class KimiProvider implements AIProvider {
  constructor(private config: AIProviderConfig) {}

  async generateReport(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl ?? "https://api.kimi.com/coding/v1";

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": "https://github.com/RooVetGit/Roo-Cline",
        "X-Title": "Roo Code",
        "User-Agent": "RooCode/3.14.0",
      },
      body: JSON.stringify({
        model: this.config.model ?? "kimi-for-coding",
        max_tokens: this.config.maxTokens ?? 8000,
        temperature: this.config.temperature ?? 0.6,
        reasoning_effort: "medium",
        messages: [
          {
            role: "system",
            content:
              "你是一位资深 A 股分析师，擅长基于财务数据、技术指标和市场行情撰写专业的投资研报。语言简洁专业，数据驱动，风险提示客观。",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`Kimi API error ${res.status}: ${err}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
    };

    const message = json.choices?.[0]?.message;
    const reasoning = message?.reasoning_content ?? "";
    const content = message?.content ?? "";

    // 返回时把思考过程和正式回答分开标注
    if (reasoning && content) {
      return `<details class="mb-3"><summary class="cursor-pointer text-xs text-muted-foreground font-medium">思考过程</summary><div class="mt-1 text-xs text-muted-foreground/80 leading-relaxed">${reasoning}</div></details>

${content}`;
    }

    return content || reasoning;
  }
}
