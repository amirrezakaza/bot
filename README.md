# 🎓 StudentAI — Telegram AI Student Super Assistant

پلتفرم Production-Ready دستیار هوشمند دانشجویی برای تلگرام، ساخته‌شده با **Next.js (App Router) + PostgreSQL (Drizzle ORM)**.

## ✨ Features

| بخش | توضیح |
|---|---|
| 💬 AI Chat | چت با حافظه (Context)، تاریخچه، مدیریت توکن، `/new` برای ریست |
| 🎓 Academic Assistant | حل مسئله مرحله‌به‌مرحله با ۴ سطح پاسخ (فقط جواب / کوتاه / کامل / دانشگاهی) |
| 📷 Image Solver | ارسال عکس سؤال → Vision → استخراج → حل (نیازمند AI با Vision) |
| 💻 Programming | تولید کد، دیباگ، Refactor، تست، توضیح خطا + آپلود فایل کد |
| 📄 File Intelligence | تحلیل فایل‌های متنی/کد با Chunking و محدودیت حجم |
| 📊 Data Assistant | تحلیل CSV: آمار، مقادیر گمشده، فرمول، پیشنهاد نمودار |
| 📚 Research | طرح تحقیق، Outline، چکیده — **بدون تولید منبع جعلی** |
| 📝 Writing | بازنویسی، خلاصه، گسترش، رسمی‌سازی، ویرایش، سبک آکادمیک |
| 🌐 Translate | فارسی ↔ انگلیسی |
| 👨‍💼 Resume Builder | فرآیند ۷ مرحله‌ای → رزومه ATS-Friendly |
| 🗓️ Planner + Reminders | یادآوری تکی/روزانه/هفتگی با Scheduler واقعی |
| 💎 Subscription | سه سطح FREE/PRO/PREMIUM با سقف روزانه قابل تنظیم از پنل |
| 💳 Payments | معماری Abstraction + MockPaymentProvider قابل تست |
| 🎁 Referral | کد دعوت یکتا (`/start ref_CODE`) + پاداش اعتبار |
| 🎫 Support | تیکت کاربر → پاسخ ادمین مستقیماً به تلگرام کاربر |
| 🛠️ Admin Panel | داشبورد آمار، مدیریت کاربران (Ban/Tier/Credit)، Broadcast، تنظیمات، Audit Log |
| 🤖 Web Simulator | تست کامل بات بدون توکن تلگرام در `/simulator` |

## 🧩 Architecture

```
src/
├── app/
│   ├── page.tsx                  # لندینگ
│   ├── simulator/                # شبیه‌ساز وب بات
│   ├── admin/                    # پنل ادمین (داشبورد/کاربران/تیکت/برادکست/تنظیمات)
│   ├── admin-login/              # ورود ادمین
│   └── api/
│       ├── telegram/webhook/     # وب‌هوک تلگرام (با Secret Token)
│       ├── telegram/setup/       # ثبت وب‌هوک
│       ├── simulator/            # ورودی شبیه‌ساز
│       ├── cron/reminders/       # دیسپچر یادآوری‌ها
│       └── health/
├── lib/
│   ├── ai.ts                     # AIProvider (OpenAI-compatible + Mock)
│   ├── telegram.ts               # کلاینت تلگرام + Sender abstraction
│   ├── payments.ts               # PaymentProvider abstraction + Mock
│   ├── settings.ts               # تنظیمات داینامیک (DB-backed)
│   ├── admin-auth.ts             # احراز هویت پنل
│   └── bot/
│       ├── engine.ts             # موتور بات (transport-agnostic)
│       ├── texts.ts              # متن‌ها، منوها، System Promptها (fa)
│       └── reminders.ts          # پارس و دیسپچ یادآوری
└── db/
    ├── schema.ts                 # 11 جدول با Index/FK
    └── index.ts
```

**نکته معماری:** موتور بات به Transport وابسته نیست — همان Engine هم وب‌هوک واقعی تلگرام و هم شبیه‌ساز وب را پشتیبانی می‌کند (الگوی `Sender`).

## 🗄️ Database

جداول: `users, conversations, messages, usage_logs, payments, referrals, reminders, support_tickets, ticket_messages, audit_logs, settings`

اعمال اسکیما: `npx drizzle-kit push`

## 🚀 Setup

1. `cp .env.example .env` و مقادیر را پر کنید.
2. `npm install && npx drizzle-kit push && npm run build && npm start`
3. **تلگرام:** از @BotFather توکن بگیرید، سپس وب‌هوک را ثبت کنید:
   ```bash
   curl -X POST https://your-domain/api/telegram/setup \
     -H "x-admin-password: YOUR_ADMIN_PASSWORD" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://your-domain"}'
   ```
4. **یادآوری‌ها:** یک Cron دقیقه‌ای به `GET /api/cron/reminders` تنظیم کنید.
5. **پنل ادمین:** `/admin` (رمز از `ADMIN_PASSWORD`).

## 🔐 Security Checklist

- ✅ همه Secretها فقط از Environment Variables
- ✅ وب‌هوک با `x-telegram-bot-api-secret-token` تأیید می‌شود
- ✅ Rate Limiting روزانه per-tier + اعتبار
- ✅ محدودیت حجم و پسوند فایل (MIME/Extension validation)
- ✅ ORM (Drizzle) → مصونیت SQL Injection
- ✅ پنل ادمین با کوکی HttpOnly (هش‌شده، نه رمز خام)
- ✅ Error Sanitization: کاربر فقط Trace ID می‌بیند؛ جزئیات در Audit Log
- ✅ هیچ کلید/توکنی Log نمی‌شود
- ✅ Audit Log برای عملیات حساس (Ban، تغییر اشتراک، اعتبار، Broadcast، تنظیمات)

## 🧪 Testing without Telegram

بدون `TELEGRAM_BOT_TOKEN` و `AI_API_KEY`:
- شبیه‌ساز `/simulator` تمام جریان‌ها را اجرا می‌کند (ثبت‌نام، منو، اشتراک، پرداخت Mock، رفرال، تیکت، یادآوری)
- `MockProvider` پاسخ آزمایشی می‌دهد تا زیرساخت قابل تست باشد

## 🛠️ Troubleshooting

| مشکل | راه‌حل |
|---|---|
| بات پاسخ نمی‌دهد | `GET /api/telegram/setup` → وضعیت وب‌هوک را ببینید |
| 401 روی وب‌هوک | `TELEGRAM_WEBHOOK_SECRET` باید با مقدار ثبت‌شده یکی باشد |
| پاسخ Mock می‌آید | `AI_API_KEY` را تنظیم و سرور را ری‌استارت کنید |
| یادآوری نمی‌رسد | Cron به `/api/cron/reminders` را فعال کنید |
