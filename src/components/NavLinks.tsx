"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; roles?: string[] };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads", roles: ["OWNER", "MANAGER", "AGENT"] },
  { href: "/follow-ups", label: "Follow-ups", roles: ["OWNER", "MANAGER", "AGENT"] },
  { href: "/inventory", label: "Inventory" },
  { href: "/reservations", label: "Reservations" },
  { href: "/deals", label: "Deals" },
  { href: "/payments", label: "Payments" },
  { href: "/collections", label: "Collections" },
  { href: "/commissions", label: "Commissions" },
  { href: "/clients", label: "Clients & Documents" },
  { href: "/settings", label: "Settings", roles: ["OWNER", "MANAGER"] },
  { href: "/audit", label: "Audit log", roles: ["OWNER", "MANAGER"] },
];

export function NavLinks({ role }: { role: string }) {
  const path = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {ITEMS.filter((i) => !i.roles || i.roles.includes(role)).map((i) => {
        const active = path === i.href || path.startsWith(i.href + "/");
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`mb-0.5 block rounded-md px-3 py-2 text-sm ${active ? "bg-emerald-700 text-white" : "hover:bg-slate-800"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
