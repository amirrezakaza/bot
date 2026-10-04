/**
 * Payment Provider Abstraction.
 * The platform is not coupled to any gateway; new providers implement
 * the PaymentProvider interface and are registered in getPaymentProvider().
 */
import { db } from "@/db";
import { payments, users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSettingNumber } from "@/lib/settings";

export interface PaymentProvider {
  readonly name: string;
  /** Creates a payment and returns instructions / redirect info for the user. */
  createPayment(userId: number, tier: "PRO" | "PREMIUM"): Promise<{
    paymentId: number;
    message: string;
  }>;
  /** Verifies and settles a payment. */
  verifyPayment(paymentId: number): Promise<{ success: boolean; message: string }>;
}

const TIER_DAYS = 30;

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createPayment(userId: number, tier: "PRO" | "PREMIUM") {
    const amount = await getSettingNumber(`price_${tier}`);
    const [p] = await db
      .insert(payments)
      .values({ userId, provider: this.name, amount, tier, status: "pending" })
      .returning();
    return {
      paymentId: p.id,
      message: `🧾 فاکتور شماره ${p.id} برای اشتراک ${tier} به مبلغ ${amount.toLocaleString("fa-IR")} تومان صادر شد.\n(درگاه آزمایشی — برای پرداخت، دکمه «پرداخت آزمایشی» را بزنید)`,
    };
  }

  async verifyPayment(paymentId: number) {
    const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (rows.length === 0) return { success: false, message: "فاکتور یافت نشد." };
    const p = rows[0];
    if (p.status === "paid") return { success: true, message: "این فاکتور قبلاً پرداخت شده است." };

    const expires = new Date(Date.now() + TIER_DAYS * 24 * 3600 * 1000);
    await db
      .update(payments)
      .set({ status: "paid", reference: `MOCK-${Date.now()}` })
      .where(eq(payments.id, paymentId));
    await db
      .update(users)
      .set({ tier: p.tier, tierExpiresAt: expires })
      .where(eq(users.id, p.userId));
    await db.insert(auditLogs).values({
      actor: "system",
      action: "subscription_activated",
      details: { userId: p.userId, tier: p.tier, paymentId },
    });
    return {
      success: true,
      message: `✅ پرداخت موفق! اشتراک ${p.tier} شما تا ${TIER_DAYS} روز فعال شد.`,
    };
  }
}

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!provider) provider = new MockPaymentProvider();
  return provider;
}
