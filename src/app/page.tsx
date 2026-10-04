import Link from "next/link";
import { isTelegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: "💬", title: "چت هوشمند", desc: "گفتگو با حافظه کامل (Context)، تاریخچه و مدیریت توکن" },
  { icon: "🎓", title: "دستیار درسی", desc: "حل مسئله مرحله‌به‌مرحله در ریاضی، فیزیک، شیمی و…" },
  { icon: "💻", title: "برنامه‌نویسی", desc: "تولید کد، دیباگ، Refactor، تست و توضیح خطا" },
  { icon: "📚", title: "تحقیق", desc: "طرح تحقیق، Outline، چکیده — بدون منبع جعلی" },
  { icon: "📄", title: "تحلیل فایل", desc: "خلاصه، کوییز و فلش‌کارت از فایل‌های متنی و کد" },
  { icon: "📊", title: "تحلیل داده", desc: "آمار توصیفی CSV، مقادیر گمشده و پیشنهاد نمودار" },
  { icon: "📝", title: "نویسنده", desc: "بازنویسی، خلاصه، رسمی‌سازی، ویرایش و سبک آکادمیک" },
  { icon: "🌐", title: "ترجمه", desc: "ترجمه حرفه‌ای دوطرفه فارسی ↔ انگلیسی" },
  { icon: "🗓️", title: "برنامه‌ریزی", desc: "یادآوری تکی و تکرارشونده + برنامه مطالعه هوشمند" },
  { icon: "👨‍💼", title: "رزومه‌ساز", desc: "رزومه حرفه‌ای ATS-Friendly با فرآیند گام‌به‌گام" },
  { icon: "💎", title: "اشتراک", desc: "سه سطح FREE / PRO / PREMIUM با سقف قابل تنظیم" },
  { icon: "🎁", title: "دعوت دوستان", desc: "کد رفرال اختصاصی و پاداش اعتبار برای هر دعوت" },
];

export default function HomePage() {
  const tg = isTelegramConfigured();
  const ai = !!process.env.AI_API_KEY;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-16 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-6">
          <div className="text-7xl">🎓</div>
          <h1 className="text-4xl sm:text-5xl font-black bg-gradient-to-l from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            StudentAI
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-8">
            دستیار هوشمند دانشجویی در تلگرام — حل مسئله درسی، برنامه‌نویسی، تحقیق، تحلیل فایل و
            داده، رزومه‌ساز، یادآوری و اشتراک؛ همه در یک بات.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/simulator"
              className="px-7 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold transition shadow-lg shadow-indigo-600/25"
            >
              🤖 امتحان بات در شبیه‌ساز وب
            </Link>
            <Link
              href="/admin"
              className="px-7 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-bold transition"
            >
              🛠️ پنل مدیریت
            </Link>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
            <span className={`px-3 py-1 rounded-full border ${tg ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-amber-500/40 text-amber-400 bg-amber-500/10"}`}>
              {tg ? "✅ تلگرام متصل است" : "⏳ TELEGRAM_BOT_TOKEN تنظیم نشده — شبیه‌ساز فعال است"}
            </span>
            <span className={`px-3 py-1 rounded-full border ${ai ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-amber-500/40 text-amber-400 bg-amber-500/10"}`}>
              {ai ? "✅ هوش مصنوعی متصل است" : "⏳ AI_API_KEY تنظیم نشده — حالت Mock فعال است"}
            </span>
          </div>
        </section>

        {/* Features */}
        <section>
          <h2 className="text-2xl font-bold text-center mb-8">🧩 قابلیت‌ها</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/40 transition"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold mb-1">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-6">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Setup */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4">
          <h2 className="text-2xl font-bold">🚀 اتصال به تلگرام واقعی</h2>
          <ol className="list-decimal pr-5 space-y-2 text-slate-300 text-sm leading-7">
            <li>از <span dir="ltr" className="text-indigo-300">@BotFather</span> یک بات بسازید و توکن بگیرید.</li>
            <li>
              متغیرهای محیطی را تنظیم کنید:{" "}
              <code dir="ltr" className="bg-slate-800 px-2 py-0.5 rounded text-xs">
                TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, AI_API_KEY, ADMIN_PASSWORD
              </code>
            </li>
            <li>
              وب‌هوک را ثبت کنید:{" "}
              <code dir="ltr" className="bg-slate-800 px-2 py-0.5 rounded text-xs">
                POST /api/telegram/setup {"{ \"url\": \"https://your-domain\" }"}
              </code>{" "}
              با هدر <code dir="ltr" className="bg-slate-800 px-2 py-0.5 rounded text-xs">x-admin-password</code>
            </li>
            <li>
              برای یادآوری‌ها یک Cron دقیقه‌ای به{" "}
              <code dir="ltr" className="bg-slate-800 px-2 py-0.5 rounded text-xs">GET /api/cron/reminders</code>{" "}
              بزنید.
            </li>
          </ol>
          <p className="text-xs text-slate-500">
            بدون توکن هم می‌توانید کل پلتفرم (ثبت‌نام، اشتراک، رفرال، تیکت، یادآوری، پنل ادمین) را
            در شبیه‌ساز تست کنید.
          </p>
        </section>
      </div>
    </div>
  );
}
