import type { CalendarPref } from "@prisma/client";
import { ETHIOPIAN_MONTHS, fromEthiopian, toEthiopian } from "./ethiopian";

const OFFSET = 3 * 3600 * 1000;

/** Calendar month containing `d`, in the company's calendar (Addis time). */
export type Month = { key: string; start: Date; end: Date; label: string };

export function monthOf(d: Date, cal: CalendarPref): Month {
  if (cal === "ETHIOPIAN") {
    const e = toEthiopian(d);
    const start = fromEthiopian({ year: e.year, month: e.month, day: 1 });
    const next = e.month === 13 ? { year: e.year + 1, month: 1 } : { year: e.year, month: e.month + 1 };
    return { key: `${e.year}-${String(e.month).padStart(2, "0")}`, start, end: fromEthiopian({ ...next, day: 1 }), label: `${ETHIOPIAN_MONTHS[e.month - 1]} ${e.year}` };
  }
  const l = new Date(d.getTime() + OFFSET);
  const y = l.getUTCFullYear(), m = l.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - OFFSET);
  const end = new Date(Date.UTC(y, m + 1, 1) - OFFSET);
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`, start, end, label: start.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" }) };
}

/** The last `n` months ending with the current one, oldest first. */
export function lastMonths(n: number, cal: CalendarPref, now = new Date()): Month[] {
  const out: Month[] = [monthOf(now, cal)];
  while (out.length < n) out.unshift(monthOf(new Date(out[0].start.getTime() - 86400000), cal));
  return out;
}

/** Ethiopian mobile number -> international digits for wa.me / t.me links. */
export function intlPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("251")) return d;
  if (d.startsWith("0")) return "251" + d.slice(1);
  if (d.length === 9) return "251" + d;
  return d;
}
