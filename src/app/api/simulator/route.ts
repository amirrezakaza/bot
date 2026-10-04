import { NextRequest, NextResponse } from "next/server";
import { processUpdate, type TgUpdate } from "@/lib/bot/engine";
import { CollectingSender } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Web-based bot simulator: feeds a synthetic Telegram update through the
 * exact same bot engine and returns the bot replies for rendering.
 */
export async function POST(req: NextRequest) {
  let body: {
    userId?: number;
    firstName?: string;
    text?: string;
    callbackData?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const userId = Number(body.userId);
  if (!Number.isFinite(userId) || userId >= 0) {
    // Simulator users use negative IDs so they can never collide with real
    // Telegram accounts.
    return NextResponse.json({ error: "userId must be a negative number" }, { status: 400 });
  }
  const text = (body.text ?? "").slice(0, 4000);
  const from = {
    id: userId,
    first_name: (body.firstName ?? "کاربر آزمایشی").slice(0, 60),
    username: `sim_${Math.abs(userId)}`,
  };

  const update: TgUpdate = body.callbackData
    ? {
        callback_query: {
          id: String(Date.now()),
          from,
          data: body.callbackData.slice(0, 64),
          message: { chat: { id: userId } },
        },
      }
    : {
        message: {
          message_id: Date.now(),
          from,
          chat: { id: userId },
          text,
        },
      };

  const sender = new CollectingSender();
  await processUpdate(update, sender);

  return NextResponse.json({
    replies: sender.collected.map((m) => ({
      text: m.text,
      replyKeyboard: m.replyKeyboard ?? null,
      inlineKeyboard: m.inlineKeyboard ?? null,
    })),
  });
}
