"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface InlineBtn {
  text: string;
  callback_data?: string;
  url?: string;
}

interface Bubble {
  from: "user" | "bot";
  text: string;
  inlineKeyboard?: InlineBtn[][] | null;
}

export default function SimulatorPage() {
  const [userId, setUserId] = useState<number | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [keyboard, setKeyboard] = useState<string[][] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("sa_sim_uid");
    const uid = saved ? Number(saved) : -Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem("sa_sim_uid", String(uid));
    setUserId(uid);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, busy]);

  async function callBot(payload: { text?: string; callbackData?: string }, echo?: string) {
    if (!userId || busy) return;
    if (echo) setBubbles((b) => [...b, { from: "user", text: echo }]);
    setBusy(true);
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, firstName: "کاربر وب", ...payload }),
      });
      const data = (await res.json()) as {
        replies?: { text: string; replyKeyboard: string[][] | null; inlineKeyboard: InlineBtn[][] | null }[];
      };
      for (const r of data.replies ?? []) {
        setBubbles((b) => [...b, { from: "bot", text: r.text, inlineKeyboard: r.inlineKeyboard }]);
        if (r.replyKeyboard) setKeyboard(r.replyKeyboard);
      }
    } catch {
      setBubbles((b) => [...b, { from: "bot", text: "⚠️ خطا در ارتباط با سرور." }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (userId && !startedRef.current) {
      startedRef.current = true;
      callBot({ text: "/start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function sendText(text: string) {
    const t = text.trim();
    if (!t) return;
    setInput("");
    callBot({ text: t }, t);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-2xl">🎓</span> StudentAI — شبیه‌ساز بات تلگرام
          </div>
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← بازگشت به سایت
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-3 overflow-y-auto">
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.from === "user" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-6 ${
                b.from === "user"
                  ? "bg-indigo-600 text-white rounded-tr-sm"
                  : "bg-slate-800 border border-slate-700 rounded-tl-sm"
              }`}
            >
              {b.text}
              {b.inlineKeyboard && (
                <div className="mt-3 space-y-1.5">
                  {b.inlineKeyboard.map((row, ri) => (
                    <div key={ri} className="flex gap-1.5 flex-wrap">
                      {row.map((btn, bi) => (
                        <button
                          key={bi}
                          onClick={() =>
                            btn.callback_data && callBot({ callbackData: btn.callback_data }, `▫️ ${btn.text}`)
                          }
                          className="flex-1 min-w-fit text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 transition"
                        >
                          {btn.text}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-end">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-slate-400 animate-pulse">
              در حال تایپ…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/90 sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
          {keyboard && (
            <div className="space-y-1.5">
              {keyboard.map((row, ri) => (
                <div key={ri} className="flex gap-1.5">
                  {row.map((label) => (
                    <button
                      key={label}
                      onClick={() => sendText(label)}
                      disabled={busy}
                      className="flex-1 text-xs sm:text-sm px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 transition"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="پیام خود را بنویسید… (مثلاً: انتگرال x² را حل کن)"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              disabled={busy || !input.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-sm"
            >
              ارسال
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
