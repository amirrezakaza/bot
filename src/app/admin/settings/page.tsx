import { getAllSettings } from "@/lib/settings";
import { saveSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

const FIELDS: { key: string; label: string }[] = [
  { key: "limit_FREE", label: "سقف روزانه FREE" },
  { key: "limit_PRO", label: "سقف روزانه PRO" },
  { key: "limit_PREMIUM", label: "سقف روزانه PREMIUM" },
  { key: "welcome_credits", label: "اعتبار هدیه ثبت‌نام" },
  { key: "referral_reward", label: "پاداش هر دعوت (اعتبار)" },
  { key: "price_PRO", label: "قیمت ماهانه PRO (تومان)" },
  { key: "price_PREMIUM", label: "قیمت ماهانه PREMIUM (تومان)" },
  { key: "max_file_bytes", label: "حداکثر حجم فایل (بایت)" },
];

export default async function AdminSettingsPage() {
  const current = await getAllSettings();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">⚙️ تنظیمات پلتفرم</h1>
      <p className="text-slate-400 text-sm">
        تمام محدودیت‌ها و قیمت‌ها بدون نیاز به Deploy مجدد از همین‌جا قابل تغییرند.
      </p>
      <form action={saveSettingsAction} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="block text-sm space-y-1.5">
              <span className="text-slate-300">{f.label}</span>
              <input
                name={f.key}
                type="number"
                min={0}
                defaultValue={current[f.key] ?? ""}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              />
            </label>
          ))}
        </div>
        <button className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold">
          💾 ذخیره تنظیمات
        </button>
      </form>
    </div>
  );
}
