import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Configurable platform settings with safe defaults. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  // Daily AI-request limits per tier
  limit_FREE: "20",
  limit_PRO: "200",
  limit_PREMIUM: "2000",
  // Referral reward (credits given to the inviter)
  referral_reward: "10",
  // Welcome credits for new users
  welcome_credits: "5",
  // Subscription prices (toman) — used by the mock payment provider
  price_PRO: "99000",
  price_PREMIUM: "249000",
  // Max accepted file size in bytes (default 10MB)
  max_file_bytes: String(10 * 1024 * 1024),
};

export async function getSetting(key: string): Promise<string> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (rows.length > 0) return rows[0].value;
  return DEFAULT_SETTINGS[key] ?? "";
}

export async function getSettingNumber(key: string): Promise<number> {
  const v = await getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  const merged: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[row.key] = row.value;
  return merged;
}
