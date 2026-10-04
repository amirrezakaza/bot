import { NextRequest, NextResponse } from "next/server";
import { tgApi, isTelegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * One-shot webhook registration:
 *   POST /api/telegram/setup  { "url": "https://your-domain.com" }
 * Requires ADMIN_PASSWORD via the x-admin-password header.
 */
export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() || "studentai-admin";
  if (req.headers.get("x-admin-password") !== adminPassword) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" },
      { status: 400 },
    );
  }
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.url?.startsWith("https://")) {
    return NextResponse.json({ ok: false, error: "url must be https" }, { status: 400 });
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const result = await tgApi("setWebhook", {
    url: `${body.url.replace(/\/$/, "")}/api/telegram/webhook`,
    ...(secret ? { secret_token: secret } : {}),
    allowed_updates: ["message", "callback_query"],
  });
  return NextResponse.json(result);
}

export async function GET() {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" });
  }
  const info = await tgApi("getWebhookInfo", {});
  return NextResponse.json(info);
}
