/**
 * AI Provider Abstraction Layer.
 * Business logic never talks to a vendor SDK directly — it only uses the
 * AIProvider interface. Providers are selected via environment variables:
 *
 *   AI_API_KEY   – if present, the OpenAI-compatible provider is used
 *   AI_BASE_URL  – defaults to https://api.openai.com/v1 (any compatible gateway works)
 *   AI_MODEL     – defaults to gpt-4o-mini
 *
 * Without a key the MockProvider answers, so the whole platform stays testable.
 */

export type ChatRole = "system" | "user" | "assistant";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ChatResult {
  content: string;
  tokens: number;
  model: string;
  provider: string;
}

export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<ChatResult>;
  supportsVision(): boolean;
}

// ─────────────────────── OpenAI-compatible provider ──────────────────────
class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
  ) {}

  supportsVision(): boolean {
    return true;
  }

  async chat(
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts?.maxTokens ?? 1800,
        temperature: opts?.temperature ?? 0.6,
      }),
    });

    if (!res.ok) {
      // Error sanitization: never leak keys or raw payloads to callers.
      const status = res.status;
      throw new Error(`AI provider request failed (HTTP ${status})`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    return {
      content: content || "پاسخی دریافت نشد. لطفاً دوباره تلاش کنید.",
      tokens: data.usage?.total_tokens ?? Math.ceil(content.length / 3),
      model: data.model ?? this.model,
      provider: this.name,
    };
  }
}

// ─────────────────────────────── Mock provider ───────────────────────────
class MockProvider implements AIProvider {
  readonly name = "mock";

  supportsVision(): boolean {
    return false;
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const text =
      typeof last?.content === "string"
        ? last.content
        : last?.content
            ?.map((p) => (p.type === "text" ? p.text : "[تصویر]"))
            .join(" ") ?? "";
    const system = messages.find((m) => m.role === "system");
    const mode =
      typeof system?.content === "string" && system.content.includes("برنامه‌نویسی")
        ? "برنامه‌نویسی"
        : "عمومی";

    const content = [
      "🤖 (حالت آزمایشی — MockProvider)",
      "",
      `درخواست شما دریافت شد (حوزه: ${mode}):`,
      `«${text.slice(0, 300)}»`,
      "",
      "برای فعال‌سازی پاسخ‌های واقعی هوش مصنوعی، متغیر محیطی AI_API_KEY را تنظیم کنید.",
      "تمام زیرساخت (Context، محدودیت مصرف، اشتراک و…) همین حالا فعال و واقعی است.",
    ].join("\n");

    return { content, tokens: Math.ceil(content.length / 3), model: "mock-1", provider: this.name };
  }
}

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const key = process.env.AI_API_KEY;
  if (key && key.trim().length > 0) {
    cached = new OpenAICompatibleProvider(
      key.trim(),
      process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1",
      process.env.AI_MODEL?.trim() || "gpt-4o-mini",
    );
  } else {
    cached = new MockProvider();
  }
  return cached;
}
