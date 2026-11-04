import Link from "next/link";
import { requireSession } from "@/lib/session";
import { logout } from "../(auth)/actions";
import { BottomNav, NavLinks } from "@/components/NavLinks";
import { formatEthiopian } from "@/lib/ethiopian";
import { formatGregorian } from "@/lib/format";
import { I18nProvider } from "@/i18n/client";
import { enumLabel, translator } from "@/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const t = translator(s.locale);
  const now = new Date();
  const footer = (
    <>
      <div className="text-slate-400">{formatEthiopian(now)} · {formatGregorian(now)}</div>
      <div className="mt-2 font-medium">{s.name}</div>
      <div className="text-slate-400">{enumLabel(t, s.role)}</div>
      <form action={logout}>
        <button className="mt-2 min-h-11 cursor-pointer text-emerald-600 hover:underline">{t("Sign out")}</button>
      </form>
    </>
  );
  return (
    <I18nProvider locale={s.locale ?? "en"}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-slate-900 text-slate-200 md:flex print:hidden">
          <Link href="/dashboard" className="block border-b border-slate-800 px-5 py-4">
            <div className="text-sm font-semibold text-white">{s.companyName}</div>
            <div className="text-xs text-slate-400">{t("Sales management")}</div>
          </Link>
          <NavLinks role={s.role} />
          <div className="border-t border-slate-800 px-5 py-3 text-xs [&_.font-medium]:text-white">{footer}</div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden print:hidden">
            <Link href="/dashboard" className="font-semibold text-slate-900">{s.companyName}</Link>
            <span className="text-xs text-slate-500">{formatEthiopian(now)}</span>
          </header>
          <main className="p-4 pb-24 md:p-8 md:pb-8 print:p-0">{children}</main>
        </div>
        <BottomNav role={s.role} footer={footer} />
      </div>
    </I18nProvider>
  );
}
