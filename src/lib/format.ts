import type { CalendarPref } from "@prisma/client";
import { formatEthiopian } from "./ethiopian";

const ADDIS_OFFSET = 3 * 3600 * 1000;

export function money(n: number | { toString(): string } | null | undefined) {
  const v = Number(n ?? 0);
  return "ETB " + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatGregorian(d: Date) {
  return new Date(d.getTime() + ADDIS_OFFSET).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDate(d: Date | null | undefined, cal: CalendarPref) {
  if (!d) return "—";
  return cal === "ETHIOPIAN" ? formatEthiopian(d) : formatGregorian(d);
}

export function fmtDateTime(d: Date | null | undefined, cal: CalendarPref) {
  if (!d) return "—";
  const t = new Date(d.getTime() + ADDIS_OFFSET).toISOString().slice(11, 16);
  return `${fmtDate(d, cal)} ${t}`;
}

/** Gregorian "YYYY-MM-DD" (Addis local) -> Date at Addis midnight. */
export function parseDateInput(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - ADDIS_OFFSET);
}

export function toDateInput(d: Date) {
  return new Date(d.getTime() + ADDIS_OFFSET).toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

export function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export function label(v: string) {
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
