import { db } from "@/db";
import { reminders } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { TelegramSender, isTelegramConfigured } from "@/lib/telegram";

export type Recurrence = "none" | "daily" | "weekly";

/**
 * Parses a reminder input such as:
 *   "30m | جزوه فیزیک را بخوان"
 *   "2h | استراحت"
 *   "18:30 | کلاس آنلاین"            (today, or tomorrow if passed)
 *   "2026-03-01 09:00 | امتحان ریاضی"
 *   "... | ... | روزانه"  /  "| هفتگی"  for recurring reminders
 */
export function parseReminderInput(
  input: string,
  now = new Date(),
): { dueAt: Date; text: string; recurrence: Recurrence } | { error: string } {
  const parts = input.split("|").map((p) => p.trim());
  if (parts.length < 2 || !parts[1]) {
    return {
      error:
        "فرمت صحیح:\nزمان | متن یادآوری\n\nنمونه‌ها:\n30m | جزوه بخوان\n2h | استراحت\n18:30 | کلاس آنلاین\n2026-03-01 09:00 | امتحان ریاضی\n08:00 | ورزش | روزانه",
    };
  }
  const when = parts[0];
  const text = parts[1];
  let recurrence: Recurrence = "none";
  if (parts[2]) {
    const r = parts[2].toLowerCase();
    if (r.includes("روز") || r === "daily") recurrence = "daily";
    else if (r.includes("هفت") || r === "weekly") recurrence = "weekly";
  }

  // Relative: 30m / 2h / 1d
  const rel = when.match(/^(\d+)\s*(m|h|d|دقیقه|ساعت|روز)$/i);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    const ms =
      unit === "m" || unit === "دقیقه"
        ? n * 60_000
        : unit === "h" || unit === "ساعت"
          ? n * 3_600_000
          : n * 86_400_000;
    return { dueAt: new Date(now.getTime() + ms), text, recurrence };
  }

  // Absolute: YYYY-MM-DD HH:MM
  const abs = when.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  if (abs) {
    const d = new Date(+abs[1], +abs[2] - 1, +abs[3], +abs[4], +abs[5]);
    if (isNaN(d.getTime())) return { error: "تاریخ نامعتبر است." };
    return { dueAt: d, text, recurrence };
  }

  // Time only: HH:MM → today or tomorrow
  const tm = when.match(/^(\d{1,2}):(\d{2})$/);
  if (tm) {
    const d = new Date(now);
    d.setHours(+tm[1], +tm[2], 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return { dueAt: d, text, recurrence };
  }

  return { error: "زمان قابل تشخیص نیست. نمونه: «30m | متن» یا «18:30 | متن»" };
}

/** Dispatches all due reminders. Returns the number of sent reminders. */
export async function dispatchDueReminders(): Promise<number> {
  const due = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.isSent, false), lte(reminders.dueAt, new Date())))
    .limit(50);

  if (due.length === 0) return 0;
  const sender = new TelegramSender();
  let sent = 0;

  for (const r of due) {
    if (isTelegramConfigured() && r.chatId > 0) {
      await sender.send({ chatId: r.chatId, text: `🔔 یادآوری:\n${r.text}` });
    }
    sent++;
    if (r.recurrence === "daily" || r.recurrence === "weekly") {
      const next = new Date(r.dueAt);
      do {
        next.setDate(next.getDate() + (r.recurrence === "daily" ? 1 : 7));
      } while (next.getTime() <= Date.now());
      await db.update(reminders).set({ dueAt: next }).where(eq(reminders.id, r.id));
    } else {
      await db.update(reminders).set({ isSent: true }).where(eq(reminders.id, r.id));
    }
  }
  return sent;
}
