import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudentAI — دستیار هوشمند دانشجویی در تلگرام",
  description:
    "پلتفرم دستیار هوشمند تلگرامی: حل مسئله درسی، برنامه‌نویسی، تحقیق، تحلیل فایل، رزومه‌ساز، یادآوری و اشتراک.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
