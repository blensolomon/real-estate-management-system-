import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { MANAGERS } from "@/lib/permissions";
import { money } from "@/lib/format";
import { lastMonths, monthOf } from "@/lib/months";
import { getT } from "@/i18n/server";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveTarget } from "./actions";

export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ month?: string; msg?: string; error?: string }> }) {
  const s = await requireSession(MANAGERS);
  const sp = await searchParams;
  const t = await getT();
  const now = new Date();
  const options = [...lastMonths(6, s.calendar, now), monthOf(new Date(monthOf(now, s.calendar).end.getTime() + 86400000), s.calendar)];
  const month = options.find((m) => m.key === sp.month) ?? monthOf(now, s.calendar);
  const [agents, targets, deals] = await Promise.all([
    db.user.findMany({ where: { companyId: s.companyId, active: true, role: "AGENT" }, orderBy: { name: "asc" } }),
    db.salesTarget.findMany({ where: { companyId: s.companyId, month: month.key } }),
    db.deal.findMany({ where: { companyId: s.companyId, status: { not: "CANCELLED" }, signedAt: { gte: month.start, lt: month.end } }, select: { agentId: true, price: true } }),
  ]);
  return (
    <div>
      <PageHeader title={t("Sales targets")} sub={t("Set a monthly sales target for each agent. Progress shows on the home screen.")} />
      <Flash msg={sp.msg} error={sp.error} />
      <form className="mb-4 flex gap-2">
        <select name="month" defaultValue={month.key} className="input max-w-xs">{options.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <button className="btn-secondary">{t("Show")}</button>
      </form>
      <div className="card p-0">
        {agents.length === 0 ? <div className="p-4"><Empty>{t("No agents yet. Add them in Settings.")}</Empty></div> : (
          <ul className="divide-y divide-slate-100">
            {agents.map((a) => {
              const target = Number(targets.find((g) => g.userId === a.id)?.amount ?? 0);
              const sold = deals.filter((d) => d.agentId === a.id).reduce((x, d) => x + Number(d.price), 0);
              const pct = target ? Math.round((sold / target) * 100) : 0;
              const tone = !target ? "text-slate-500" : pct >= 100 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-rose-700";
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.name}{a.external && <span className="ml-2 text-xs text-slate-500">{t("External broker")}</span>}</div>
                    <div className={`text-sm ${tone}`}>{t("Sold {sold}", { sold: money(sold) })}{target ? ` · ${pct}%` : ` · ${t("no target")}`}</div>
                  </div>
                  <form action={saveTarget} className="flex gap-2">
                    <input type="hidden" name="userId" value={a.id} />
                    <input type="hidden" name="month" value={month.key} />
                    <input name="amount" inputMode="numeric" defaultValue={target || ""} placeholder={t("Target (ETB)")} className="input w-40" />
                    <SubmitButton>{t("Save")}</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
