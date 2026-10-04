import { db } from "@/db";
import {
  users,
  usageLogs,
  payments,
  referrals,
  supportTickets,
  reminders,
  auditLogs,
  messages,
} from "@/db/schema";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export const dynamic = "force-dynamic";

async function count(table: PgTable, where?: SQL): Promise<number> {
  const q = db.select({ c: sql<number>`count(*)::int` }).from(table);
  const rows = where ? await q.where(where) : await q;
  return rows[0]?.c ?? 0;
}

export default async function AdminDashboard() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    todayUsers,
    bannedUsers,
    proUsers,
    totalRequests,
    todayRequests,
    paidPayments,
    openTickets,
    activeReminders,
    totalReferrals,
    totalMessages,
  ] = await Promise.all([
    count(users),
    count(users, gte(users.createdAt, startOfDay)),
    count(users, eq(users.isBanned, true)),
    count(users, sql`${users.tier} != 'FREE'`),
    count(usageLogs),
    count(usageLogs, gte(usageLogs.createdAt, startOfDay)),
    count(payments, eq(payments.status, "paid")),
    count(supportTickets, eq(supportTickets.status, "open")),
    count(reminders, eq(reminders.isSent, false)),
    count(referrals),
    count(messages),
  ]);

  const [tokenRow] = await db
    .select({ t: sql<number>`coalesce(sum(${usageLogs.tokens}), 0)::int` })
    .from(usageLogs);

  const featureRows = await db
    .select({ feature: usageLogs.feature, c: sql<number>`count(*)::int` })
    .from(usageLogs)
    .groupBy(usageLogs.feature)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const recentLogs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(12);

  const errorCount = await count(auditLogs, and(eq(auditLogs.action, "error"), gte(auditLogs.createdAt, startOfDay)));

  const cards = [
    { label: "کل کاربران", value: totalUsers, icon: "👥" },
    { label: "کاربر جدید امروز", value: todayUsers, icon: "🆕" },
    { label: "اشتراک فعال", value: proUsers, icon: "💎" },
    { label: "مسدود شده", value: bannedUsers, icon: "🚫" },
    { label: "کل درخواست‌های AI", value: totalRequests, icon: "🤖" },
    { label: "درخواست امروز", value: todayRequests, icon: "📈" },
    { label: "کل پیام‌ها", value: totalMessages, icon: "💬" },
    { label: "توکن مصرفی", value: tokenRow?.t ?? 0, icon: "🔢" },
    { label: "پرداخت موفق", value: paidPayments, icon: "💰" },
    { label: "تیکت باز", value: openTickets, icon: "🎫" },
    { label: "یادآوری فعال", value: activeReminders, icon: "🔔" },
    { label: "دعوت موفق", value: totalReferrals, icon: "🎁" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📊 داشبورد</h1>
        {errorCount > 0 && (
          <span className="text-sm px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
            ⚠️ {errorCount} خطای امروز
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-2xl font-bold">{c.value.toLocaleString("fa-IR")}</div>
            <div className="text-sm text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="font-bold mb-4">🧩 مصرف به تفکیک قابلیت</h2>
          <div className="space-y-2">
            {featureRows.length === 0 && <p className="text-slate-500 text-sm">هنوز داده‌ای نیست.</p>}
            {featureRows.map((f) => {
              const max = featureRows[0]?.c ?? 1;
              return (
                <div key={f.feature} className="flex items-center gap-3 text-sm">
                  <span className="w-28 text-slate-300">{f.feature}</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full"
                      style={{ width: `${Math.max(6, (f.c / max) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 text-left text-slate-400">{f.c}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="font-bold mb-4">📜 آخرین رویدادها (Audit Log)</h2>
          <div className="space-y-2 text-sm">
            {recentLogs.length === 0 && <p className="text-slate-500">رویدادی ثبت نشده.</p>}
            {recentLogs.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5">
                <span className={l.action === "error" ? "text-rose-400" : "text-slate-300"}>
                  {l.action}
                </span>
                <span className="text-slate-500 text-xs ltr:text-right" dir="ltr">
                  {l.createdAt.toLocaleString("fa-IR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
