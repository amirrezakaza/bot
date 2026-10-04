import { NextResponse } from "next/server";
import { dispatchDueReminders } from "@/lib/bot/reminders";

export const dynamic = "force-dynamic";

/**
 * Reminder dispatcher. Call periodically (e.g. every minute) via an external
 * cron / uptime pinger:  GET /api/cron/reminders
 */
export async function GET() {
  try {
    const sent = await dispatchDueReminders();
    return NextResponse.json({ ok: true, dispatched: sent });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
