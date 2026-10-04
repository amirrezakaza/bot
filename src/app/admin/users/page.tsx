import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { addCreditsAction, setTierAction, toggleBanAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const rows = await db.select().from(users).orderBy(desc(users.id)).limit(200);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">👥 کاربران ({rows.length.toLocaleString("fa-IR")})</h1>

      <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-slate-400 border-b border-slate-800">
              <th className="p-3">کاربر</th>
              <th className="p-3">اشتراک</th>
              <th className="p-3">اعتبار</th>
              <th className="p-3">وضعیت</th>
              <th className="p-3">عضویت</th>
              <th className="p-3">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-500">
                  هنوز کاربری ثبت نشده. از شبیه‌ساز یا تلگرام /start بزنید.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                <td className="p-3">
                  <div className="font-medium">{u.firstName ?? "—"}</div>
                  <div className="text-xs text-slate-500" dir="ltr">
                    @{u.username ?? "—"} · {u.telegramId}
                  </div>
                </td>
                <td className="p-3">
                  <form action={setTierAction} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={u.id} />
                    <select
                      name="tier"
                      defaultValue={u.tier}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                    >
                      <option value="FREE">FREE</option>
                      <option value="PRO">PRO</option>
                      <option value="PREMIUM">PREMIUM</option>
                    </select>
                    <button className="text-xs px-2 py-1 rounded bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40">
                      ثبت
                    </button>
                  </form>
                </td>
                <td className="p-3">
                  <form action={addCreditsAction} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={u.id} />
                    <span className="text-amber-300 font-bold ml-1">{u.credits}</span>
                    <input
                      name="amount"
                      type="number"
                      placeholder="±"
                      className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                    />
                    <button className="text-xs px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40">
                      اعمال
                    </button>
                  </form>
                </td>
                <td className="p-3">
                  {u.isBanned ? (
                    <span className="text-rose-400">🚫 مسدود</span>
                  ) : (
                    <span className="text-emerald-400">✅ فعال</span>
                  )}
                </td>
                <td className="p-3 text-slate-400 text-xs">
                  {u.createdAt.toLocaleDateString("fa-IR")}
                </td>
                <td className="p-3">
                  <form action={toggleBanAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      className={`text-xs px-3 py-1 rounded ${
                        u.isBanned
                          ? "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40"
                          : "bg-rose-600/20 text-rose-300 hover:bg-rose-600/40"
                      }`}
                    >
                      {u.isBanned ? "رفع مسدودی" : "مسدودسازی"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
