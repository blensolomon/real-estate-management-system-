import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { isPlatformAdmin, listCompanies } from "@/lib/tenancy";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatGregorian } from "@/lib/format";
import { toggleCompany } from "./actions";

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; q?: string }> }) {
  const s = await requireSession();
  const me = await db.user.findUnique({ where: { id: s.userId }, select: { email: true } });
  if (!isPlatformAdmin(me?.email)) redirect("/dashboard?denied=1");
  const { msg, error, q } = await searchParams;
  const all = await listCompanies();
  const companies = q ? all.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : all;
  return (
    <div className="space-y-4">
      <PageHeader title="Companies on the platform" sub="Every company sees only its own data. Suspending a company signs its users out immediately." />
      <Flash msg={msg} error={error} />
      <form className="flex gap-2">
        <input name="q" defaultValue={q} className="input" placeholder="Search company" />
        <button className="btn-secondary">Search</button>
      </form>
      {companies.length === 0 && <p className="muted">No companies found.</p>}
      <ul className="space-y-3">
        {companies.map((c) => (
          <li key={c.id} className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="muted text-sm">
                  {c.users[0] ? `${c.users[0].name} · ${c.users[0].email}` : "No owner"} · joined {formatGregorian(c.createdAt)}
                </div>
              </div>
              <Badge tone={c.active ? "green" : "red"}>{c.active ? "Active" : "Suspended"}</Badge>
            </div>
            <div className="muted text-sm">
              {c._count.users} users · {c._count.projects} projects · {c._count.units} units · {c._count.deals} sales
            </div>
            <form action={toggleCompany} className="flex flex-wrap gap-2">
              <input type="hidden" name="companyId" value={c.id} />
              <input type="hidden" name="active" value={c.active ? "false" : "true"} />
              {c.active && <input name="note" className="input flex-1" placeholder="Reason for suspending" required />}
              <SubmitButton className={c.active ? "btn-danger" : "btn"}>{c.active ? "Suspend" : "Reactivate"}</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
