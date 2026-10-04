import { NextRequest, NextResponse } from "next/server";
import { processUpdate, type TgUpdate } from "@/lib/bot/engine";
import { TelegramSender } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Telegram webhook endpoint.
 * Security: if TELEGRAM_WEBHOOK_SECRET is set, the request must carry the
 * matching `x-telegram-bot-api-secret-token` header (set via setWebhook).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  await processUpdate(update, new TelegramSender());
  // Always 200 so Telegram does not endlessly retry.
  return NextResponse.json({ ok: true });
}
