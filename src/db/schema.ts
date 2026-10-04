import {
  pgTable,
  serial,
  text,
  bigint,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─────────────────────────────── Users ───────────────────────────────
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    username: text("username"),
    firstName: text("first_name"),
    language: text("language").notNull().default("fa"),
    tier: text("tier").notNull().default("FREE"), // FREE | PRO | PREMIUM
    tierExpiresAt: timestamp("tier_expires_at"),
    credits: integer("credits").notNull().default(0),
    referralCode: text("referral_code").notNull(),
    referredBy: bigint("referred_by", { mode: "number" }),
    isBanned: boolean("is_banned").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    botState: jsonb("bot_state").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeen: timestamp("last_seen").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_telegram_id_idx").on(t.telegramId),
    uniqueIndex("users_referral_code_idx").on(t.referralCode),
  ],
);

// ──────────────────────────── Conversations ──────────────────────────
export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("گفتگوی جدید"),
    mode: text("mode").notNull().default("chat"),
    model: text("model"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("conversations_user_idx").on(t.userId, t.isActive)],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // system | user | assistant
    content: text("content").notNull(),
    tokens: integer("tokens").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);

// ─────────────────────────────── Usage ───────────────────────────────
export const usageLogs = pgTable(
  "usage_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(), // chat | academic | programming | file | ...
    tokens: integer("tokens").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_user_date_idx").on(t.userId, t.createdAt)],
);

// ────────────────────────────── Payments ─────────────────────────────
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("mock"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("IRT"),
    tier: text("tier").notNull(),
    status: text("status").notNull().default("pending"), // pending | paid | failed
    reference: text("reference"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("payments_user_idx").on(t.userId)],
);

// ────────────────────────────── Referrals ────────────────────────────
export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    inviterId: integer("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedId: integer("invited_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reward: integer("reward").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("referrals_inviter_idx").on(t.inviterId),
    uniqueIndex("referrals_invited_idx").on(t.invitedId),
  ],
);

// ────────────────────────────── Reminders ────────────────────────────
export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    text: text("text").notNull(),
    dueAt: timestamp("due_at").notNull(),
    recurrence: text("recurrence").notNull().default("none"), // none | daily | weekly
    isSent: boolean("is_sent").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("reminders_due_idx").on(t.isSent, t.dueAt)],
);

// ─────────────────────────────── Support ─────────────────────────────
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("open"), // open | answered | closed
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("tickets_user_idx").on(t.userId), index("tickets_status_idx").on(t.status)],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(), // user | admin
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId)],
);

// ────────────────────────────── Audit Log ────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(), // admin:<id> | system | bot
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_action_idx").on(t.action, t.createdAt)],
);

// ────────────────────────────── Settings ─────────────────────────────
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
