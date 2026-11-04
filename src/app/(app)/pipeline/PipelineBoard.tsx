"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { moveStage } from "../leads/actions";

type Card = { id: string; name: string; phone: string; owner: string; budget: number | null; status: string; lostReason: string | null };

const TONE: Record<string, string> = { NEW: "border-t-sky-500", CONTACTED: "border-t-indigo-500", SITE_VISIT: "border-t-amber-500", NEGOTIATION: "border-t-orange-500", WON: "border-t-emerald-600", LOST: "border-t-slate-400" };

export function PipelineBoard({ stages, cards }: { stages: string[]; cards: Card[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);

  function move(leadId: string, stage: string, from: string) {
    if (stage === from) return;
    if (stage === "WON") return alert(t("A lead becomes Won when a sale is made for it"));
    let reason = "";
    if (stage === "LOST") {
      reason = prompt(t("Why was this lead lost?")) ?? "";
      if (!reason.trim()) return;
    }
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("stage", stage);
    fd.set("reason", reason);
    fd.set("returnTo", location.pathname + location.search.replace(/[?&](msg|error)=[^&]*/g, ""));
    start(() => moveStage(fd));
  }

  return (
    <div className={`flex snap-x gap-3 overflow-x-auto pb-4 ${pending ? "opacity-60" : ""}`}>
      {stages.map((stage) => {
        const list = cards.filter((c) => c.status === stage);
        return (
          <section
            key={stage}
            onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { setOver(null); const [id, from] = e.dataTransfer.getData("text/plain").split("|"); move(id, stage, from); }}
            className={`w-72 shrink-0 snap-start rounded-xl border border-t-4 bg-slate-50 p-2 ${TONE[stage]} ${over === stage ? "ring-2 ring-emerald-500" : ""}`}
          >
            <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
              {t(stage.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()))}
              <span className="rounded-full bg-white px-2 text-xs text-slate-500">{list.length}</span>
            </h2>
            {list.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-400">{t("No leads")}</p>}
            <ul className="space-y-2">
              {list.map((c) => (
                <li key={c.id} draggable={c.status !== "WON"} onDragStart={(e) => e.dataTransfer.setData("text/plain", `${c.id}|${c.status}`)} className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                  <Link href={`/leads/${c.id}`} className="link font-medium">{c.name}</Link>
                  <div className="text-xs text-slate-500">{c.phone} · {c.owner}</div>
                  {c.budget && <div className="text-xs text-slate-500">{t("Budget")}: {c.budget.toLocaleString()} ETB</div>}
                  {c.lostReason && <div className="text-xs text-slate-500">{t("Lost")}: {c.lostReason}</div>}
                  {c.status !== "WON" && (
                    <select aria-label={t("Move to stage")} value={c.status} onChange={(e) => move(c.id, e.target.value, c.status)} className="input mt-2 min-h-11 py-1 text-xs">
                      {stages.filter((s) => s !== "WON").map((s) => <option key={s} value={s}>{t("Move to")}: {s.replace("_", " ").toLowerCase()}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
