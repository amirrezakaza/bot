import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: url,
});

const sql = `
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "telegram_id" bigint NOT NULL,
  "username" text,
  "first_name" text,
  "language" text NOT NULL DEFAULT 'fa',
  "tier" text NOT NULL DEFAULT 'FREE',
  "tier_expires_at" timestamp,
  "credits" integer NOT NULL DEFAULT 0,
  "referral_code" text NOT NULL,
  "referred_by" bigint,
  "is_banned" boolean NOT NULL DEFAULT false,
  "is_admin" boolean NOT NULL DEFAULT false,
  "bot_state" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_seen" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_id_idx"
ON "users" ("telegram_id");

CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_idx"
ON "users" ("referral_code");

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT 'گفتگوی جدید',
  "mode" text NOT NULL DEFAULT 'chat',
  "model" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversations_user_idx"
ON "conversations" ("user_id", "is_active");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY,
  "conversation_id" integer NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "tokens" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "messages_conversation_idx"
ON "messages" ("conversation_id");

CREATE TABLE IF NOT EXISTS "usage_logs" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "feature" text NOT NULL,
  "tokens" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "usage_user_date_idx"
ON "usage_logs" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "payments" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL DEFAULT 'mock',
  "amount" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'IRT',
  "tier" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "reference" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "payments_user_idx"
ON "payments" ("user_id");

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" serial PRIMARY KEY,
  "inviter_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "invited_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reward" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "referrals_inviter_idx"
ON "referrals" ("inviter_id");

CREATE UNIQUE INDEX IF NOT EXISTS "referrals_invited_idx"
ON "referrals" ("invited_id");

CREATE TABLE IF NOT EXISTS "reminders" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chat_id" bigint NOT NULL,
  "text" text NOT NULL,
  "due_at" timestamp NOT NULL,
  "recurrence" text NOT NULL DEFAULT 'none',
  "is_sent" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reminders_due_idx"
ON "reminders" ("is_sent", "due_at");

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tickets_user_idx"
ON "support_tickets" ("user_id");

CREATE INDEX IF NOT EXISTS "tickets_status_idx"
ON "support_tickets" ("status");

CREATE TABLE IF NOT EXISTS "ticket_messages" (
  "id" serial PRIMARY KEY,
  "ticket_id" integer NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
  "sender" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_idx"
ON "ticket_messages" ("ticket_id");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY,
  "actor" text NOT NULL,
  "action" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_action_idx"
ON "audit_logs" ("action", "created_at");

CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

INSERT INTO "settings" ("key", "value") VALUES
  ('limit_FREE', '10'),
  ('limit_PRO', '100'),
  ('limit_PREMIUM', '500'),
  ('price_PRO', '99000'),
  ('price_PREMIUM', '199000'),
  ('max_file_bytes', '5242880')
ON CONFLICT ("key") DO NOTHING;
`;

try {
  await pool.query(sql);
  console.log("StudentAI database schema is ready.");
} finally {
  await pool.end();
}