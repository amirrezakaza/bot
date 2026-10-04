"use client";

import { useActionState } from "react";
import { broadcastAction } from "../actions";

export default function AdminBroadcastPage() {
  const [state, formAction, pending] = useActionState(broadcastAction, {});

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">📢 اعلان همگانی</h1>
      <p className="text-slate-400 text-sm">
        پیام برای همه کاربران غیرمسدود ارسال می‌شود (تحویل واقعی فقط با TELEGRAM_BOT_TOKEN فعال).
      </p>
      <form action={formAction} className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-6">
        <textarea
          name="message"
          required
          rows={6}
          placeholder="متن اعلان…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm"
        />
        <button
          disabled={pending}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold"
        >
          {pending ? "در حال ارسال…" : "ارسال به همه"}
        </button>
        {state?.error && <p className="text-rose-400 text-sm">{state.error}</p>}
        {state?.total !== undefined && (
          <p className="text-emerald-400 text-sm">
            ✅ انجام شد — مخاطبان: {state.total} نفر، ارسال واقعی تلگرام: {state.sent} پیام.
          </p>
        )}
      </form>
    </div>
  );
}
