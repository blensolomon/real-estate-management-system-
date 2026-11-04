import Link from "next/link";

const TONES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
  gray: "bg-slate-100 text-slate-700",
  purple: "bg-violet-100 text-violet-800",
};

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "green", RESERVED: "amber", SOLD: "blue", BLOCKED: "gray",
  ACTIVE: "green", EXPIRED: "gray", CANCELLED: "red", CONVERTED: "blue", COMPLETED: "blue",
  PENDING: "amber", CONFIRMED: "green", REJECTED: "red",
  NEW: "blue", CONTACTED: "purple", SITE_VISIT: "amber", NEGOTIATION: "amber", WON: "green", LOST: "gray",
};

export function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const key = typeof children === "string" ? STATUS_TONE[children] : undefined;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone ?? key ?? "gray"]}`}>
      {typeof children === "string" ? children.replaceAll("_", " ") : children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "red" | "green" | "amber"; href?: string }) {
  const color = tone === "red" ? "text-rose-700" : tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  const body = (
    <div className="card h-full">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {sub && <p className="muted mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (error) return <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div>;
  if (msg) return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{msg}</div>;
  return null;
}
