"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";

type Item = { href: string; label: string; icon: string; roles?: string[] };

const SALES = ["OWNER", "MANAGER", "AGENT"];
export const NAV_ITEMS: Item[] = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/leads", label: "Leads", icon: "☺", roles: SALES },
  { href: "/pipeline", label: "Pipeline", icon: "▥", roles: SALES },
  { href: "/follow-ups", label: "Tasks & visits", icon: "✓", roles: SALES },
  { href: "/collections", label: "Who owes us money", icon: "!", roles: ["OWNER", "MANAGER", "AGENT", "ACCOUNTANT"] },
  { href: "/inventory", label: "Units", icon: "▦" },
  { href: "/reservations", label: "Reservations", icon: "◷", roles: SALES },
  { href: "/deals", label: "Sales", icon: "★", roles: ["OWNER", "MANAGER", "AGENT", "ACCOUNTANT"] },
  { href: "/payments", label: "Payments", icon: "₿", roles: ["OWNER", "MANAGER", "AGENT", "ACCOUNTANT"] },
  { href: "/commissions", label: "Commissions", icon: "%", roles: ["OWNER", "MANAGER", "AGENT", "ACCOUNTANT"] },
  { href: "/clients", label: "Clients & files", icon: "▤", roles: ["OWNER", "MANAGER", "AGENT", "ACCOUNTANT"] },
  { href: "/targets", label: "Targets", icon: "◎", roles: ["OWNER", "MANAGER"] },
  { href: "/approvals", label: "Price approvals", icon: "✓", roles: ["OWNER", "MANAGER"] },
  { href: "/settings", label: "Settings", icon: "⚙", roles: ["OWNER", "ADMIN"] },
  { href: "/audit", label: "History", icon: "↺", roles: ["OWNER", "MANAGER", "ADMIN"] },
];

const BOTTOM: Record<string, string[]> = {
  OWNER: ["/dashboard", "/collections", "/inventory", "/leads"],
  MANAGER: ["/dashboard", "/leads", "/follow-ups", "/inventory"],
  AGENT: ["/dashboard", "/leads", "/follow-ups", "/inventory"],
  ACCOUNTANT: ["/dashboard", "/payments", "/collections", "/commissions"],
  ADMIN: ["/dashboard", "/inventory", "/settings", "/audit"],
};

const visible = (role: string) => NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role));
const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function NavLinks({ role }: { role: string }) {
  const path = usePathname();
  const t = useT();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {visible(role).map((i) => (
        <Link key={i.href} href={i.href} className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive(path, i.href) ? "bg-emerald-700 text-white" : "hover:bg-slate-800"}`}>
          <span className="w-4 text-center opacity-80" aria-hidden>{i.icon}</span>{t(i.label)}
        </Link>
      ))}
    </nav>
  );
}

/** Phone navigation: four role-specific shortcuts plus a "More" sheet with everything else. */
export function BottomNav({ role, footer }: { role: string; footer: React.ReactNode }) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const items = visible(role);
  const main = (BOTTOM[role] ?? BOTTOM.AGENT).map((h) => items.find((i) => i.href === h)).filter(Boolean) as Item[];
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-24"
            onClick={(e) => {
              e.stopPropagation();
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              {items.map((i) => (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs ${isActive(path, i.href) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>
                  <span className="text-xl" aria-hidden>{i.icon}</span>{t(i.label)}
                </Link>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3 text-sm">{footer}</div>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {main.map((i) => (
          <Link key={i.href} href={i.href} className={`flex min-h-14 flex-col items-center justify-center text-[11px] leading-tight ${isActive(path, i.href) ? "text-emerald-700 font-semibold" : "text-slate-600"}`}>
            <span className="text-lg" aria-hidden>{i.icon}</span><span className="max-w-full truncate px-1">{t(i.label)}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-14 flex-col items-center justify-center text-[11px] text-slate-600">
          <span className="text-lg" aria-hidden>☰</span>{t("More")}
        </button>
      </nav>
    </>
  );
}
