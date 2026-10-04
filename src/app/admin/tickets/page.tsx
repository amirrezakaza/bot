import { db } from "@/db";
import { supportTickets, ticketMessages, users } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { closeTicketAction, replyTicketAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_FA: Record<string, string> = {
  open: "🟡 باز",
  answered: "🟢 پاسخ داده شده",
  closed: "⚪ بسته",
};

export default async function AdminTicketsPage() {
  const tickets = await db
    .select({ ticket: supportTickets, user: users })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .orderBy(desc(supportTickets.id))
    .limit(50);

  const ids = tickets.map((t) => t.ticket.id);
  const msgs =
    ids.length > 0
      ? await db
          .select()
          .from(ticketMessages)
          .where(inArray(ticketMessages.ticketId, ids))
          .orderBy(ticketMessages.id)
      : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">🎫 تیکت‌های پشتیبانی</h1>
      {tickets.length === 0 && (
        <p className="text-slate-500 bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          تیکتی ثبت نشده است.
        </p>
      )}
      <div className="space-y-5">
        {tickets.map(({ ticket, user }) => (
          <div key={ticket.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-bold">#{ticket.id} — {ticket.subject}</span>
                <span className="text-sm text-slate-400 mr-3">
                  از: {user.firstName ?? "کاربر"} (<span dir="ltr">{user.telegramId}</span>)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{STATUS_FA[ticket.status] ?? ticket.status}</span>
                {ticket.status !== "closed" && (
                  <form action={closeTicketAction}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <button className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">
                      بستن تیکت
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {msgs
                .filter((m) => m.ticketId === ticket.id)
                .map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm rounded-lg px-3 py-2 max-w-xl ${
                      m.sender === "admin"
                        ? "bg-indigo-600/15 border border-indigo-500/30 mr-auto"
                        : "bg-slate-800 border border-slate-700"
                    }`}
                  >
                    <div className="text-xs text-slate-400 mb-1">
                      {m.sender === "admin" ? "👨‍💼 پشتیبانی" : "👤 کاربر"} ·{" "}
                      {m.createdAt.toLocaleString("fa-IR")}
                    </div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
            </div>

            {ticket.status !== "closed" && (
              <form action={replyTicketAction} className="flex gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <input
                  name="content"
                  required
                  placeholder="پاسخ شما (مستقیماً به تلگرام کاربر ارسال می‌شود)…"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold">
                  ارسال پاسخ
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
