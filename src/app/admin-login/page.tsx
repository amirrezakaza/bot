"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/admin/actions";

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <form
        action={formAction}
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5"
      >
        <div className="text-center space-y-1">
          <div className="text-4xl">🎓</div>
          <h1 className="text-xl font-bold text-white">پنل مدیریت StudentAI</h1>
          <p className="text-slate-400 text-sm">برای ورود رمز مدیر را وارد کنید</p>
        </div>
        <input
          type="password"
          name="password"
          required
          placeholder="رمز عبور مدیر"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        {state?.error && <p className="text-rose-400 text-sm">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 transition"
        >
          {pending ? "در حال ورود…" : "ورود"}
        </button>
        <p className="text-xs text-slate-500 text-center">
          رمز پیش‌فرض (در صورت نبود ADMIN_PASSWORD): studentai-admin
        </p>
      </form>
    </div>
  );
}
