/**
 * StudentAI Bot Engine — transport-agnostic.
 * The same engine powers the Telegram webhook and the web simulator.
 */
import { db } from "@/db";
import {
  users,
  conversations,
  messages,
  usageLogs,
  referrals,
  reminders,
  supportTickets,
  ticketMessages,
  auditLogs,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAIProvider, type ChatMessage, type ChatContentPart } from "@/lib/ai";
import { getSettingNumber } from "@/lib/settings";
import {
  type Sender,
  downloadTelegramFile,
  isTelegramConfigured,
} from "@/lib/telegram";
import {
  MENU,
  MAIN_KEYBOARD,
  BACK_KEYBOARD,
  WELCOME,
  HELP,
  SYSTEM_PROMPTS,
  ACADEMIC_LEVELS,
  WRITING_TOOLS,
  RESUME_STEPS,
} from "./texts";
import { parseReminderInput, dispatchDueReminders } from "./reminders";
import { getPaymentProvider } from "@/lib/payments";

// ───────────────────────────── Update types ─────────────────────────────
export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  language_code?: string;
}

export interface TgUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    from?: TgUser;
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: { file_id: string; file_size?: number }[];
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  };
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { chat: { id: number } };
  };
}

type DbUser = typeof users.$inferSelect;
type BotState = { mode?: string; sub?: string; step?: number; data?: Record<string, string> };

const MODES_WITH_PROMPTS = new Set(Object.keys(SYSTEM_PROMPTS));

function genReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ───────────────────────────── User management ──────────────────────────
async function ensureUser(from: TgUser, startParam?: string): Promise<DbUser> {
  const existing = await db.select().from(users).where(eq(users.telegramId, from.id)).limit(1);
  if (existing.length > 0) {
    const [u] = await db
      .update(users)
      .set({
        lastSeen: new Date(),
        username: from.username ?? existing[0].username,
        firstName: from.first_name ?? existing[0].firstName,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return u;
  }

  const welcomeCredits = await getSettingNumber("welcome_credits");
  const [created] = await db
    .insert(users)
    .values({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      language: from.language_code === "en" ? "en" : "fa",
      referralCode: genReferralCode(),
      credits: welcomeCredits,
    })
    .returning();

  // Referral handling: /start ref_CODE
  if (startParam?.startsWith("ref_")) {
    const code = startParam.slice(4).toUpperCase();
    const inviter = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
    if (inviter.length > 0 && inviter[0].id !== created.id) {
      const reward = await getSettingNumber("referral_reward");
      await db.insert(referrals).values({
        inviterId: inviter[0].id,
        invitedId: created.id,
        reward,
      });
      await db
        .update(users)
        .set({
          credits: sql`${users.credits} + ${reward}`,
          referredBy: inviter[0].telegramId,
        })
        .where(eq(users.id, inviter[0].id));
      await db
        .update(users)
        .set({ referredBy: inviter[0].telegramId })
        .where(eq(users.id, created.id));
      await db.insert(auditLogs).values({
        actor: "bot",
        action: "referral_registered",
        details: { inviter: inviter[0].id, invited: created.id, reward },
      });
    }
  }

  await db.insert(auditLogs).values({
    actor: "bot",
    action: "user_registered",
    details: { userId: created.id, telegramId: created.telegramId },
  });
  return created;
}

async function setState(userId: number, state: BotState): Promise<void> {
  await db.update(users).set({ botState: state as Record<string, unknown> }).where(eq(users.id, userId));
}

// ───────────────────────────── Rate limiting ────────────────────────────
async function checkRateLimit(user: DbUser): Promise<{ allowed: boolean; message?: string }> {
  // Expire outdated subscriptions
  let tier = user.tier;
  if (tier !== "FREE" && user.tierExpiresAt && user.tierExpiresAt.getTime() < Date.now()) {
    await db.update(users).set({ tier: "FREE", tierExpiresAt: null }).where(eq(users.id, user.id));
    tier = "FREE";
  }
  const limit = await getSettingNumber(`limit_${tier}`);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, user.id), gte(usageLogs.createdAt, startOfDay)));
  const used = row?.count ?? 0;

  if (used < limit) return { allowed: true };

  // Fall back to credits
  if (user.credits > 0) {
    await db
      .update(users)
      .set({ credits: sql`${users.credits} - 1` })
      .where(eq(users.id, user.id));
    return { allowed: true };
  }
  return {
    allowed: false,
    message: `⛔ سقف روزانه شما (${limit} درخواست، سطح ${tier}) پر شده و اعتباری ندارید.\n\n💎 برای افزایش سقف، از بخش «${MENU.subscription}» اشتراک تهیه کنید یا با دعوت دوستان اعتبار بگیرید («${MENU.account}»).`,
  };
}

// ─────────────────────────── Conversation / AI ──────────────────────────
async function getActiveConversation(userId: number, mode: string) {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.isActive, true)))
    .orderBy(desc(conversations.id))
    .limit(1);
  if (rows.length > 0 && rows[0].mode === mode) return rows[0];
  if (rows.length > 0) {
    await db.update(conversations).set({ isActive: false }).where(eq(conversations.id, rows[0].id));
  }
  const [conv] = await db.insert(conversations).values({ userId, mode }).returning();
  return conv;
}

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_CHARS = 14_000;

async function runAI(
  user: DbUser,
  mode: string,
  userText: string,
  opts?: { extraSystem?: string; visionParts?: ChatContentPart[]; skipHistory?: boolean },
): Promise<string> {
  const provider = getAIProvider();
  const conv = await getActiveConversation(user.id, mode);

  const systemPrompt =
    (SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.chat) + (opts?.extraSystem ? `\n${opts.extraSystem}` : "");
  const chatMessages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  if (!opts?.skipHistory) {
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.id))
      .limit(MAX_CONTEXT_MESSAGES);
    // Token management: trim history to a char budget, oldest first
    let budget = MAX_CONTEXT_CHARS;
    const trimmed: typeof history = [];
    for (const m of history) {
      if (budget - m.content.length < 0) break;
      budget -= m.content.length;
      trimmed.push(m);
    }
    for (const m of trimmed.reverse()) {
      chatMessages.push({ role: m.role as "user" | "assistant", content: m.content });
    }
  }

  if (opts?.visionParts) {
    chatMessages.push({
      role: "user",
      content: [{ type: "text", text: userText }, ...opts.visionParts],
    });
  } else {
    chatMessages.push({ role: "user", content: userText });
  }

  let result;
  try {
    result = await provider.chat(chatMessages);
  } catch {
    return "⚠️ خطا در ارتباط با سرویس هوش مصنوعی. لطفاً کمی بعد دوباره تلاش کنید.";
  }

  await db.insert(messages).values([
    { conversationId: conv.id, role: "user", content: userText.slice(0, 8000) },
    { conversationId: conv.id, role: "assistant", content: result.content, tokens: result.tokens },
  ]);
  await db.insert(usageLogs).values({ userId: user.id, feature: mode, tokens: result.tokens });
  return result.content;
}

// ──────────────────────────── Section handlers ──────────────────────────
async function showMenu(sender: Sender, chatId: number, text = "منوی اصلی 👇") {
  await sender.send({ chatId, text, replyKeyboard: MAIN_KEYBOARD });
}

async function enterMode(
  sender: Sender,
  user: DbUser,
  chatId: number,
  mode: string,
  intro: string,
  inline?: { text: string; callback_data: string }[][],
) {
  await setState(user.id, { mode });
  await sender.send({
    chatId,
    text: intro,
    replyKeyboard: BACK_KEYBOARD,
    inlineKeyboard: inline,
  });
}

async function handleMenuButton(
  sender: Sender,
  user: DbUser,
  chatId: number,
  text: string,
): Promise<boolean> {
  switch (text) {
    case MENU.chat:
      await enterMode(sender, user, chatId, "chat", "💬 چت هوشمند فعال شد.\nهر سؤالی داری بپرس! (حافظه گفتگو فعال است — /new برای پاک کردن)");
      return true;
    case MENU.academic:
      await enterMode(
        sender,
        user,
        chatId,
        "academic",
        "🎓 دستیار درسی فعال شد.\nسطح پاسخ را انتخاب کن، سپس سؤالت را بفرست (متن یا عکس):",
        [
          [
            { text: "فقط جواب", callback_data: "al:answer" },
            { text: "توضیح کوتاه", callback_data: "al:short" },
          ],
          [
            { text: "توضیح کامل", callback_data: "al:full" },
            { text: "سطح دانشگاهی", callback_data: "al:university" },
          ],
        ],
      );
      return true;
    case MENU.programming:
      await enterMode(
        sender,
        user,
        chatId,
        "programming",
        "💻 دستیار برنامه‌نویسی فعال شد.\nکد، خطا یا سؤالت را بفرست. می‌توانی فایل کد هم آپلود کنی.\nقابلیت‌ها: تولید کد، دیباگ، Refactor، تولید تست، توضیح خطا، معماری، Git/GitHub.",
      );
      return true;
    case MENU.research:
      await enterMode(
        sender,
        user,
        chatId,
        "research",
        "📚 دستیار تحقیق فعال شد.\nموضوع تحقیق را بنویس تا طرح تحقیق، فهرست مطالب و پیش‌نویس بخش‌ها را بسازم.\n⚠️ هرگز منبع جعلی تولید نمی‌کنم.",
      );
      return true;
    case MENU.files:
      await enterMode(
        sender,
        user,
        chatId,
        "files",
        "📄 بخش فایل‌ها.\nفایل متنی (txt, md, csv, json, کد) را آپلود کن یا متن سند را Paste کن.\nسپس بگو چه کاری انجام دهم: خلاصه، سؤال، کوییز، فلش‌کارت و…",
      );
      return true;
    case MENU.data:
      await enterMode(
        sender,
        user,
        chatId,
        "data",
        "📊 دستیار داده فعال شد.\nفایل CSV را آپلود کن یا داده‌ها را Paste کن تا تحلیل آماری، مقادیر گمشده، فرمول و پیشنهاد نمودار بدهم.",
      );
      return true;
    case MENU.writing:
      await enterMode(
        sender,
        user,
        chatId,
        "writing",
        "📝 دستیار نویسندگی.\nابتدا ابزار را انتخاب کن، سپس متن را بفرست:",
        chunkButtons(
          Object.entries(WRITING_TOOLS).map(([k, v]) => ({ text: v.label, callback_data: `wr:${k}` })),
          2,
        ),
      );
      return true;
    case MENU.translate:
      await enterMode(sender, user, chatId, "translate", "🌐 مترجم فعال شد.\nمتن فارسی → انگلیسی، متن انگلیسی → فارسی. متنت را بفرست.");
      return true;
    case MENU.planner:
      await enterMode(sender, user, chatId, "planner", "🗓️ برنامه‌ریزی و یادآوری:", [
        [
          { text: "➕ یادآوری جدید", callback_data: "plan:new" },
          { text: "📋 لیست یادآوری‌ها", callback_data: "plan:list" },
        ],
        [{ text: "🧠 برنامه مطالعه بساز", callback_data: "plan:study" }],
      ]);
      return true;
    case MENU.resume: {
      await setState(user.id, { mode: "resume", step: 0, data: {} });
      await sender.send({
        chatId,
        text: `👨‍💼 رزومه‌ساز گام‌به‌گام شروع شد.\n\n${RESUME_STEPS[0].question}`,
        replyKeyboard: BACK_KEYBOARD,
      });
      return true;
    }
    case MENU.subscription:
      await showSubscription(sender, user, chatId);
      return true;
    case MENU.account:
      await showAccount(sender, user, chatId);
      return true;
    case MENU.support:
      await enterMode(sender, user, chatId, "support_menu", "🎫 پشتیبانی:", [
        [
          { text: "➕ تیکت جدید", callback_data: "tk:new" },
          { text: "📋 تیکت‌های من", callback_data: "tk:list" },
        ],
      ]);
      return true;
    case MENU.back:
      await setState(user.id, {});
      await showMenu(sender, chatId);
      return true;
  }
  return false;
}

function chunkButtons<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
}

async function showSubscription(sender: Sender, user: DbUser, chatId: number) {
  const [limitFree, limitPro, limitPremium, pricePro, pricePremium] = await Promise.all([
    getSettingNumber("limit_FREE"),
    getSettingNumber("limit_PRO"),
    getSettingNumber("limit_PREMIUM"),
    getSettingNumber("price_PRO"),
    getSettingNumber("price_PREMIUM"),
  ]);
  const expires =
    user.tier !== "FREE" && user.tierExpiresAt
      ? `\n⏳ انقضا: ${user.tierExpiresAt.toLocaleDateString("fa-IR")}`
      : "";
  await sender.send({
    chatId,
    text: [
      `💎 اشتراک فعلی شما: ${user.tier}${expires}`,
      "",
      `🆓 FREE — ${limitFree} درخواست در روز`,
      `⭐ PRO — ${limitPro} درخواست در روز — ${pricePro.toLocaleString("fa-IR")} تومان/ماه`,
      `👑 PREMIUM — ${limitPremium} درخواست در روز — ${pricePremium.toLocaleString("fa-IR")} تومان/ماه`,
    ].join("\n"),
    replyKeyboard: BACK_KEYBOARD,
    inlineKeyboard: [
      [
        { text: "⭐ خرید PRO", callback_data: "sub:PRO" },
        { text: "👑 خرید PREMIUM", callback_data: "sub:PREMIUM" },
      ],
    ],
  });
}

async function showAccount(sender: Sender, user: DbUser, chatId: number) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [usedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, user.id), gte(usageLogs.createdAt, startOfDay)));
  const [refRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(eq(referrals.inviterId, user.id));
  const limit = await getSettingNumber(`limit_${user.tier}`);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim();
  const refLink = botUsername
    ? `https://t.me/${botUsername}?start=ref_${user.referralCode}`
    : `/start ref_${user.referralCode}`;

  await sender.send({
    chatId,
    text: [
      `👤 حساب شما`,
      `🆔 شناسه: ${user.telegramId}`,
      `💎 اشتراک: ${user.tier}`,
      `📊 مصرف امروز: ${usedRow?.count ?? 0} از ${limit}`,
      `🪙 اعتبار: ${user.credits}`,
      `🎁 دعوت موفق: ${refRow?.count ?? 0} نفر`,
      "",
      `🔗 لینک دعوت شما (هر دعوت = اعتبار رایگان):`,
      refLink,
    ].join("\n"),
    replyKeyboard: BACK_KEYBOARD,
  });
}

// ────────────────────────── Callback query handler ──────────────────────
async function handleCallback(sender: Sender, user: DbUser, chatId: number, data: string) {
  const [ns, ...rest] = data.split(":");
  const arg = rest.join(":");

  if (ns === "al" && ACADEMIC_LEVELS[arg]) {
    await setState(user.id, { mode: "academic", sub: arg });
    await sender.send({
      chatId,
      text: "✅ سطح پاسخ تنظیم شد. حالا سؤالت را بفرست (متن یا عکس 📷).",
      replyKeyboard: BACK_KEYBOARD,
    });
    return;
  }

  if (ns === "wr" && WRITING_TOOLS[arg]) {
    await setState(user.id, { mode: "writing", sub: arg });
    await sender.send({
      chatId,
      text: `✅ ابزار «${WRITING_TOOLS[arg].label}» انتخاب شد. متن را بفرست.`,
      replyKeyboard: BACK_KEYBOARD,
    });
    return;
  }

  if (ns === "plan") {
    if (arg === "new") {
      await setState(user.id, { mode: "reminder_add" });
      await sender.send({
        chatId,
        text: "⏰ یادآوری را به این شکل بفرست:\n\nزمان | متن\n\nنمونه‌ها:\n30m | جزوه بخوان\n18:30 | کلاس آنلاین\n2026-03-01 09:00 | امتحان ریاضی\n08:00 | ورزش | روزانه",
        replyKeyboard: BACK_KEYBOARD,
      });
    } else if (arg === "list") {
      const rows = await db
        .select()
        .from(reminders)
        .where(and(eq(reminders.userId, user.id), eq(reminders.isSent, false)))
        .orderBy(reminders.dueAt)
        .limit(15);
      const text =
        rows.length === 0
          ? "📭 یادآوری فعالی نداری."
          : "📋 یادآوری‌های فعال:\n\n" +
            rows
              .map(
                (r) =>
                  `• ${r.text}\n  ⏰ ${r.dueAt.toLocaleString("fa-IR")}${r.recurrence !== "none" ? ` (${r.recurrence === "daily" ? "روزانه" : "هفتگی"})` : ""}`,
              )
              .join("\n");
      await sender.send({ chatId, text, replyKeyboard: BACK_KEYBOARD });
    } else if (arg === "study") {
      await setState(user.id, { mode: "study_plan" });
      await sender.send({
        chatId,
        text: "🧠 بگو برای چه درس‌هایی، چند روز فرصت و روزی چند ساعت وقت داری تا برنامه مطالعه بسازم.\nمثال: «ریاضی و فیزیک، ۱۰ روز تا امتحان، روزی ۴ ساعت»",
        replyKeyboard: BACK_KEYBOARD,
      });
    }
    return;
  }

  if (ns === "sub" && (arg === "PRO" || arg === "PREMIUM")) {
    const pay = await getPaymentProvider().createPayment(user.id, arg);
    await sender.send({
      chatId,
      text: pay.message,
      inlineKeyboard: [[{ text: "💳 پرداخت آزمایشی", callback_data: `pay:${pay.paymentId}` }]],
    });
    return;
  }

  if (ns === "pay") {
    const result = await getPaymentProvider().verifyPayment(parseInt(arg, 10));
    await sender.send({ chatId, text: result.message, replyKeyboard: MAIN_KEYBOARD });
    return;
  }

  if (ns === "tk") {
    if (arg === "new") {
      await setState(user.id, { mode: "support_subject" });
      await sender.send({ chatId, text: "📌 موضوع تیکت را بنویس:", replyKeyboard: BACK_KEYBOARD });
    } else if (arg === "list") {
      const rows = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, user.id))
        .orderBy(desc(supportTickets.id))
        .limit(10);
      const text =
        rows.length === 0
          ? "📭 تیکتی نداری."
          : "🎫 تیکت‌های شما:\n\n" +
            rows
              .map(
                (t) =>
                  `#${t.id} — ${t.subject} [${t.status === "open" ? "🟡 باز" : t.status === "answered" ? "🟢 پاسخ داده شده" : "⚪ بسته"}]`,
              )
              .join("\n");
      await sender.send({ chatId, text, replyKeyboard: BACK_KEYBOARD });
    }
    return;
  }
}

// ─────────────────────── Stateful text-flow handler ─────────────────────
async function handleStatefulText(
  sender: Sender,
  user: DbUser,
  chatId: number,
  state: BotState,
  text: string,
): Promise<boolean> {
  // Reminder creation
  if (state.mode === "reminder_add") {
    const parsed = parseReminderInput(text);
    if ("error" in parsed) {
      await sender.send({ chatId, text: `⚠️ ${parsed.error}`, replyKeyboard: BACK_KEYBOARD });
      return true;
    }
    await db.insert(reminders).values({
      userId: user.id,
      chatId,
      text: parsed.text,
      dueAt: parsed.dueAt,
      recurrence: parsed.recurrence,
    });
    await setState(user.id, { mode: "planner" });
    await sender.send({
      chatId,
      text: `✅ یادآوری ثبت شد:\n«${parsed.text}»\n⏰ ${parsed.dueAt.toLocaleString("fa-IR")}${parsed.recurrence !== "none" ? ` (${parsed.recurrence === "daily" ? "روزانه" : "هفتگی"})` : ""}`,
      replyKeyboard: MAIN_KEYBOARD,
    });
    return true;
  }

  // Support flow
  if (state.mode === "support_subject") {
    await setState(user.id, { mode: "support_message", sub: text.slice(0, 200) });
    await sender.send({ chatId, text: "✍️ حالا متن پیام را بنویس:", replyKeyboard: BACK_KEYBOARD });
    return true;
  }
  if (state.mode === "support_message") {
    const [ticket] = await db
      .insert(supportTickets)
      .values({ userId: user.id, subject: state.sub ?? "بدون موضوع" })
      .returning();
    await db.insert(ticketMessages).values({ ticketId: ticket.id, sender: "user", content: text });
    await setState(user.id, {});
    await sender.send({
      chatId,
      text: `✅ تیکت #${ticket.id} ثبت شد. پاسخ پشتیبانی همین‌جا برایت ارسال می‌شود.`,
      replyKeyboard: MAIN_KEYBOARD,
    });
    return true;
  }

  // Resume builder (step-by-step)
  if (state.mode === "resume") {
    const step = state.step ?? 0;
    const data = { ...(state.data ?? {}) };
    data[RESUME_STEPS[step].key] = text;
    if (step + 1 < RESUME_STEPS.length) {
      await setState(user.id, { mode: "resume", step: step + 1, data });
      await sender.send({
        chatId,
        text: RESUME_STEPS[step + 1].question,
        replyKeyboard: BACK_KEYBOARD,
      });
      return true;
    }
    // Final step → generate
    await setState(user.id, { mode: "chat" });
    const limitCheck = await checkRateLimit(user);
    if (!limitCheck.allowed) {
      await sender.send({ chatId, text: limitCheck.message!, replyKeyboard: MAIN_KEYBOARD });
      return true;
    }
    await sender.send({ chatId, text: "⏳ در حال ساخت رزومه حرفه‌ای شما…" });
    const info = Object.entries(data)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const answer = await runAI(user, "resume", `با این اطلاعات رزومه بساز:\n${info}`, {
      skipHistory: true,
    });
    await sender.send({ chatId, text: answer, replyKeyboard: MAIN_KEYBOARD });
    return true;
  }

  // Study plan
  if (state.mode === "study_plan") {
    const limitCheck = await checkRateLimit(user);
    if (!limitCheck.allowed) {
      await sender.send({ chatId, text: limitCheck.message!, replyKeyboard: MAIN_KEYBOARD });
      return true;
    }
    await sender.send({ chatId, text: "⏳ در حال تهیه برنامه مطالعه…" });
    const answer = await runAI(
      user,
      "chat",
      `یک برنامه مطالعه روزانه دقیق و واقع‌بینانه (جدول روز به روز) برای این شرایط بساز: ${text}`,
      { skipHistory: true },
    );
    await setState(user.id, { mode: "chat" });
    await sender.send({ chatId, text: answer, replyKeyboard: MAIN_KEYBOARD });
    return true;
  }

  return false;
}

// ───────────────────────────── Main entrypoint ──────────────────────────
export async function processUpdate(update: TgUpdate, sender: Sender): Promise<void> {
  try {
    // Opportunistic reminder dispatch (cheap safety net next to the cron route)
    dispatchDueReminders().catch(() => {});

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id ?? cq.from.id;
      const user = await ensureUser(cq.from);
      await sender.answerCallback?.(cq.id);
      if (user.isBanned) {
        await sender.send({ chatId, text: "⛔ دسترسی شما مسدود شده است." });
        return;
      }
      if (cq.data) await handleCallback(sender, user, chatId, cq.data);
      return;
    }

    const msg = update.message;
    if (!msg?.from) return;
    const chatId = msg.chat.id;
    const text = (msg.text ?? "").trim();

    // /start with optional referral payload
    const startMatch = text.match(/^\/start(?:\s+(\S+))?/);
    const user = await ensureUser(msg.from, startMatch?.[1]);

    if (user.isBanned) {
      await sender.send({ chatId, text: "⛔ دسترسی شما توسط مدیریت مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید." });
      return;
    }

    const state = (user.botState ?? {}) as BotState;

    // Commands
    if (startMatch) {
      await setState(user.id, {});
      await sender.send({
        chatId,
        text: WELCOME(user.firstName ?? "دوست"),
        replyKeyboard: MAIN_KEYBOARD,
      });
      return;
    }
    if (text === "/menu") {
      await setState(user.id, {});
      await showMenu(sender, chatId);
      return;
    }
    if (text === "/help") {
      await sender.send({ chatId, text: HELP, replyKeyboard: MAIN_KEYBOARD });
      return;
    }
    if (text === "/new") {
      await db
        .update(conversations)
        .set({ isActive: false })
        .where(eq(conversations.userId, user.id));
      await sender.send({
        chatId,
        text: "🧹 حافظه گفتگو پاک شد. گفتگوی جدیدی شروع کن!",
        replyKeyboard: MAIN_KEYBOARD,
      });
      return;
    }

    // Photo → Vision pipeline
    if (msg.photo && msg.photo.length > 0) {
      await handlePhoto(sender, user, chatId, msg.photo, msg.caption, state);
      return;
    }

    // Document → file pipeline
    if (msg.document) {
      await handleDocument(sender, user, chatId, msg.document, msg.caption, state);
      return;
    }

    if (!text) return;

    // Main menu buttons
    if (await handleMenuButton(sender, user, chatId, text)) return;

    // Stateful flows (reminder / support / resume / study plan)
    if (await handleStatefulText(sender, user, chatId, state, text)) return;

    // AI modes
    const mode = state.mode && MODES_WITH_PROMPTS.has(state.mode) ? state.mode : "chat";
    const limitCheck = await checkRateLimit(user);
    if (!limitCheck.allowed) {
      await sender.send({ chatId, text: limitCheck.message!, replyKeyboard: MAIN_KEYBOARD });
      return;
    }

    let extraSystem: string | undefined;
    let userText = text;
    if (mode === "academic" && state.sub && ACADEMIC_LEVELS[state.sub]) {
      extraSystem = ACADEMIC_LEVELS[state.sub];
    }
    if (mode === "writing") {
      const tool = state.sub && WRITING_TOOLS[state.sub] ? WRITING_TOOLS[state.sub] : WRITING_TOOLS.rewrite;
      userText = `${tool.prompt}\n\n${text}`;
    }

    await sender.send({ chatId, text: "⏳ در حال پردازش…" });
    const answer = await runAI(user, mode, userText, { extraSystem });
    await sender.send({
      chatId,
      text: answer,
      replyKeyboard: state.mode ? BACK_KEYBOARD : MAIN_KEYBOARD,
    });
  } catch (err) {
    // Error handling: never crash; user gets a friendly message, details go to audit log.
    const traceId = Math.random().toString(36).slice(2, 10).toUpperCase();
    console.error(`[bot:${traceId}]`, err instanceof Error ? err.message : err);
    try {
      await db.insert(auditLogs).values({
        actor: "bot",
        action: "error",
        details: { traceId, message: err instanceof Error ? err.message : String(err) },
      });
      const chatId = update.message?.chat.id ?? update.callback_query?.from.id;
      if (chatId) {
        await sender.send({
          chatId,
          text: `⚠️ خطایی رخ داد. لطفاً دوباره تلاش کنید.\n(کد پیگیری: ${traceId})`,
        });
      }
    } catch {
      /* swallow */
    }
  }
}

// ───────────────────────────── File pipelines ───────────────────────────
async function handlePhoto(
  sender: Sender,
  user: DbUser,
  chatId: number,
  photos: { file_id: string; file_size?: number }[],
  caption: string | undefined,
  state: BotState,
) {
  const provider = getAIProvider();
  if (!provider.supportsVision() || !isTelegramConfigured()) {
    await sender.send({
      chatId,
      text: "📷 عکس دریافت شد، اما پردازش تصویر نیاز به تنظیم AI_API_KEY (با پشتیبانی Vision) و اتصال واقعی تلگرام دارد.\nفعلاً می‌توانی متن سؤال را تایپ کنی تا جواب بدهم.",
    });
    return;
  }
  const limitCheck = await checkRateLimit(user);
  if (!limitCheck.allowed) {
    await sender.send({ chatId, text: limitCheck.message!, replyKeyboard: MAIN_KEYBOARD });
    return;
  }
  const maxBytes = await getSettingNumber("max_file_bytes");
  const best = photos[photos.length - 1];
  const file = await downloadTelegramFile(best.file_id, maxBytes);
  if (!file) {
    await sender.send({ chatId, text: "⚠️ دریافت تصویر ناموفق بود یا حجم آن بیش از حد مجاز است." });
    return;
  }
  await sender.send({ chatId, text: "📷 در حال تحلیل تصویر…" });
  const b64 = file.buffer.toString("base64");
  const mode = state.mode === "academic" ? "academic" : "chat";
  const extraSystem =
    state.mode === "academic" && state.sub ? ACADEMIC_LEVELS[state.sub] : undefined;
  const answer = await runAI(
    user,
    mode,
    caption?.trim() ||
      "این تصویر را تحلیل کن. اگر سؤال درسی است آن را استخراج و مرحله‌به‌مرحله حل کن؛ اگر متن/جزوه است خلاصه کن؛ اگر کد است توضیح بده.",
    {
      extraSystem,
      visionParts: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }],
      skipHistory: true,
    },
  );
  await sender.send({ chatId, text: answer, replyKeyboard: state.mode ? BACK_KEYBOARD : MAIN_KEYBOARD });
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "yml", "yaml", "log", "sql", "html", "css",
  "js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "cs", "kt", "php", "go", "rs", "sh",
]);

async function handleDocument(
  sender: Sender,
  user: DbUser,
  chatId: number,
  doc: { file_id: string; file_name?: string; mime_type?: string; file_size?: number },
  caption: string | undefined,
  state: BotState,
) {
  const maxBytes = await getSettingNumber("max_file_bytes");
  if ((doc.file_size ?? 0) > maxBytes) {
    await sender.send({
      chatId,
      text: `⚠️ حجم فایل بیش از حد مجاز (${Math.round(maxBytes / 1024 / 1024)}MB) است.`,
    });
    return;
  }
  const ext = (doc.file_name?.split(".").pop() ?? "").toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    await sender.send({
      chatId,
      text: `📄 فایل «${doc.file_name ?? "بدون نام"}» دریافت شد.\nدر حال حاضر فایل‌های متنی و کد پشتیبانی می‌شوند: ${[...TEXT_EXTENSIONS].slice(0, 12).join(", ")}, …\nبرای PDF/DOCX می‌توانی متن را Paste کنی.`,
    });
    return;
  }
  if (!isTelegramConfigured()) {
    await sender.send({
      chatId,
      text: "📎 دریافت فایل فقط از طریق اتصال واقعی تلگرام ممکن است. در شبیه‌ساز، متن فایل را Paste کن.",
    });
    return;
  }
  const limitCheck = await checkRateLimit(user);
  if (!limitCheck.allowed) {
    await sender.send({ chatId, text: limitCheck.message!, replyKeyboard: MAIN_KEYBOARD });
    return;
  }
  const file = await downloadTelegramFile(doc.file_id, maxBytes);
  if (!file) {
    await sender.send({ chatId, text: "⚠️ دانلود فایل ناموفق بود." });
    return;
  }
  // Chunking: keep content inside the model context budget
  const content = file.buffer.toString("utf8").slice(0, 16_000);
  await sender.send({ chatId, text: "📄 در حال تحلیل فایل…" });
  const mode = state.mode === "data" || ext === "csv" ? "data" : state.mode === "programming" ? "programming" : "files";
  const request = caption?.trim() || "این فایل را تحلیل و خلاصه کن و نکات مهم را بگو.";
  const answer = await runAI(
    user,
    mode,
    `${request}\n\nنام فایل: ${doc.file_name}\nمحتوا:\n\`\`\`\n${content}\n\`\`\``,
    { skipHistory: true },
  );
  await sender.send({ chatId, text: answer, replyKeyboard: state.mode ? BACK_KEYBOARD : MAIN_KEYBOARD });
}
