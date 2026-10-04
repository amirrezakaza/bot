"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, supportTickets, ticketMessages, auditLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ADMIN_COOKIE, adminToken, getAdminPassword, isAdminAuthed } from "@/lib/admin-auth";
import { setSetting } from "@/lib/settings";
import { TelegramSender, isTelegramConfigured } from "@/lib/telegram";

async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthed())) redirect("/admin-login");
}

async function audit(action: string, details: Record<string, unknown>) {
  await db.insert(auditLogs).values({ actor: "admin:web", action, details });
}

// ─────────────────────────────── Auth ───────────────────────────────
export async function loginAction(_: unknown, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (password !== getAdminPassword()) {
    return { error: "رمز عبور اشتباه است." };
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  await audit("admin_login", {});
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/admin-login");
}

// ─────────────────────────── User management ────────────────────────
export async function toggleBanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("userId"));
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) return;
  const next = !rows[0].isBanned;
  await db.update(users).set({ isBanned: next }).where(eq(users.id, id));
  await audit(next ? "user_banned" : "user_unbanned", { userId: id });
  revalidatePath("/admin/users");
}

export async function setTierAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("userId"));
  const tier = String(formData.get("tier"));
  if (!["FREE", "PRO", "PREMIUM"].includes(tier)) return;
  const expires = tier === "FREE" ? null : new Date(Date.now() + 30 * 86400_000);
  await db.update(users).set({ tier, tierExpiresAt: expires }).where(eq(users.id, id));
  await audit("subscription_changed", { userId: id, tier });
  revalidatePath("/admin/users");
}

export async function addCreditsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("userId"));
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount === 0) return;
  await db
    .update(users)
    .set({ credits: sql`GREATEST(${users.credits} + ${Math.trunc(amount)}, 0)` })
    .where(eq(users.id, id));
  await audit("credits_changed", { userId: id, amount: Math.trunc(amount) });
  revalidatePath("/admin/users");
}

// ─────────────────────────────── Tickets ────────────────────────────
export async function replyTicketAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const ticketId = Number(formData.get("ticketId"));
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  const rows = await db
    .select({ ticket: supportTickets, user: users })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (rows.length === 0) return;

  await db.insert(ticketMessages).values({ ticketId, sender: "admin", content });
  await db.update(supportTickets).set({ status: "answered" }).where(eq(supportTickets.id, ticketId));

  // Deliver the answer straight to the user on Telegram
  if (isTelegramConfigured() && rows[0].user.telegramId > 0) {
    await new TelegramSender().send({
      chatId: rows[0].user.telegramId,
      text: `🎫 پاسخ پشتیبانی به تیکت #${ticketId} («${rows[0].ticket.subject}»):\n\n${content}`,
    });
  }
  await audit("ticket_replied", { ticketId });
  revalidatePath("/admin/tickets");
}

export async function closeTicketAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const ticketId = Number(formData.get("ticketId"));
  await db.update(supportTickets).set({ status: "closed" }).where(eq(supportTickets.id, ticketId));
  await audit("ticket_closed", { ticketId });
  revalidatePath("/admin/tickets");
}

// ────────────────────────────── Broadcast ───────────────────────────
export async function broadcastAction(
  _: unknown,
  formData: FormData,
): Promise<{ sent?: number; total?: number; error?: string }> {
  if (!(await isAdminAuthed())) return { error: "unauthorized" };
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "متن پیام خالی است." };

  const all = await db
    .select({ telegramId: users.telegramId, isBanned: users.isBanned })
    .from(users);
  const targets = all.filter((u) => !u.isBanned && u.telegramId > 0);

  let sent = 0;
  if (isTelegramConfigured()) {
    const sender = new TelegramSender();
    for (const t of targets) {
      await sender.send({ chatId: t.telegramId, text: `📢 ${message}` });
      sent++;
    }
  }
  await audit("broadcast_sent", { total: targets.length, sent, length: message.length });
  return { sent, total: targets.length };
}

// ────────────────────────────── Settings ────────────────────────────
export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const keys = [
    "limit_FREE",
    "limit_PRO",
    "limit_PREMIUM",
    "referral_reward",
    "welcome_credits",
    "price_PRO",
    "price_PREMIUM",
    "max_file_bytes",
  ];
  for (const key of keys) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    await setSetting(key, String(Math.trunc(n)));
  }
  await audit("settings_changed", {});
  revalidatePath("/admin/settings");
}
