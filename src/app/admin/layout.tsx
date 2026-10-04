import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";
import { logoutAction } from "./actions";

const NAV = [
  { href: "/admin", label: "📊 داشبورد" },
  { href: "/admin/users", label: "👥 کاربران" },
  { href: "/admin/tickets", label: "🎫 تیکت‌ها" },
  { href: "/admin/broadcast", label: "📢 اعلان همگانی" },
  { href: "/admin/settings", label: "⚙️ تنظیمات" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isAdminAuthed())) redirect("/admin-login");

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-2xl">🎓</span> StudentAI — مدیریت
          </div>
          <nav className="flex items-center gap-1 flex-wrap text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                {n.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button className="px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition">
                خروج
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
