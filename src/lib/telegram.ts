/**
 * Minimal, dependency-free Telegram Bot API client.
 * The bot engine talks to an abstract `Sender`, so the same engine powers
 * both the real Telegram webhook and the in-browser simulator.
 */

const TG_API = "https://api.telegram.org";

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface OutgoingMessage {
  chatId: number;
  text: string;
  replyKeyboard?: string[][]; // persistent reply keyboard
  inlineKeyboard?: InlineButton[][];
  removeKeyboard?: boolean;
  parseMode?: "Markdown" | "HTML";
}

export interface Sender {
  send(msg: OutgoingMessage): Promise<void>;
  answerCallback?(callbackId: string, text?: string): Promise<void>;
}

function getToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && t.trim().length > 0 ? t.trim() : null;
}

export function isTelegramConfigured(): boolean {
  return getToken() !== null;
}

export async function tgApi<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = getToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN not configured" };
  try {
    const res = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch {
    return { ok: false, description: "network error" };
  }
}

const MAX_LEN = 4000;

function chunkText(text: string): string[] {
  if (text.length <= MAX_LEN) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    let cut = Math.min(MAX_LEN, rest.length);
    const nl = rest.lastIndexOf("\n", cut);
    if (cut < rest.length && nl > MAX_LEN / 2) cut = nl;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return chunks;
}

/** Sender implementation that delivers to the real Telegram API. */
export class TelegramSender implements Sender {
  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = chunkText(msg.text);
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const payload: Record<string, unknown> = {
        chat_id: msg.chatId,
        text: chunks[i],
      };
      if (isLast) {
        if (msg.inlineKeyboard) {
          payload.reply_markup = { inline_keyboard: msg.inlineKeyboard };
        } else if (msg.replyKeyboard) {
          payload.reply_markup = {
            keyboard: msg.replyKeyboard.map((row) => row.map((text) => ({ text }))),
            resize_keyboard: true,
          };
        } else if (msg.removeKeyboard) {
          payload.reply_markup = { remove_keyboard: true };
        }
      }
      await tgApi("sendMessage", payload);
    }
  }

  async answerCallback(callbackId: string, text?: string): Promise<void> {
    await tgApi("answerCallbackQuery", { callback_query_id: callbackId, text });
  }
}

/** Sender that collects messages — used by the web simulator and tests. */
export class CollectingSender implements Sender {
  public collected: OutgoingMessage[] = [];
  async send(msg: OutgoingMessage): Promise<void> {
    this.collected.push(msg);
  }
  async answerCallback(): Promise<void> {
    /* no-op */
  }
}

/** Download a Telegram file (photos / documents) as a Buffer. */
export async function downloadTelegramFile(
  fileId: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; path: string } | null> {
  const token = getToken();
  if (!token) return null;
  const info = await tgApi<{ file_path?: string; file_size?: number }>("getFile", {
    file_id: fileId,
  });
  const filePath = info.result?.file_path;
  if (!info.ok || !filePath) return null;
  if ((info.result?.file_size ?? 0) > maxBytes) return null;
  const res = await fetch(`${TG_API}/file/bot${token}/${filePath}`);
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) return null;
  return { buffer: Buffer.from(ab), path: filePath };
}
