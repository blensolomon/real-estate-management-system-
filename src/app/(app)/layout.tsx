import Link from "next/link";
import { requireSession } from "@/lib/session";
import { logout } from "../(auth)/actions";
import { NavLinks } from "@/components/NavLinks";
import { formatEthiopian } from "@/lib/ethiopian";
import { formatGregorian } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const now = new Date();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-slate-900 text-slate-200">
        <Link href="/dashboard" className="block border-b border-slate-800 px-5 py-4">
          <div className="text-sm font-semibold text-white">{s.companyName}</div>
          <div className="text-xs text-slate-400">Sales Manager</div>
        </Link>
        <NavLinks role={s.role} />
        <div className="border-t border-slate-800 px-5 py-3 text-xs">
          <div className="text-slate-400">{formatEthiopian(now)} · {formatGregorian(now)}</div>
          <div className="mt-2 font-medium text-white">{s.name}</div>
          <div className="text-slate-400">{s.role}</div>
          <form action={logout}>
            <button className="mt-2 text-emerald-400 hover:underline cursor-pointer">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
