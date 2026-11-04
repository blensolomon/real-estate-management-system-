"use client";

import { useMemo, useState } from "react";
import {
  ETHIOPIAN_MONTHS,
  daysInEthiopianMonth,
  fromEthiopian,
  toEthiopian,
} from "@/lib/ethiopian";

const OFFSET = 3 * 3600 * 1000;
const toIso = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - OFFSET);
};

/**
 * Date input that submits a Gregorian YYYY-MM-DD value under `name`.
 * In Ethiopian mode the user picks day / month / year in the Ethiopian calendar.
 */
export function DateField({
  name,
  calendar,
  defaultValue,
  required,
}: {
  name: string;
  calendar: "ETHIOPIAN" | "GREGORIAN";
  defaultValue?: string;
  required?: boolean;
}) {
  const initial = defaultValue ? fromIso(defaultValue) : new Date();
  const [eth, setEth] = useState(() => toEthiopian(initial));
  const [greg, setGreg] = useState(defaultValue ?? (required ? toIso(initial) : ""));
  const iso = useMemo(() => {
    const day = Math.min(eth.day, daysInEthiopianMonth(eth.year, eth.month));
    return toIso(fromEthiopian({ ...eth, day }));
  }, [eth]);

  if (calendar === "GREGORIAN") {
    return (
      <input type="date" name={name} className="input" value={greg} required={required} onChange={(e) => setGreg(e.target.value)} />
    );
  }

  const years = Array.from({ length: 16 }, (_, k) => toEthiopian(new Date()).year - 5 + k);
  const days = daysInEthiopianMonth(eth.year, eth.month);
  return (
    <div>
      <div className="grid grid-cols-[3.75rem_minmax(0,1fr)_4.75rem] gap-1">
        <select aria-label="Day" className="input min-w-0 px-1.5" value={Math.min(eth.day, days)} onChange={(e) => setEth({ ...eth, day: +e.target.value })}>
          {Array.from({ length: days }, (_, k) => k + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select aria-label="Month" className="input min-w-0 px-1.5" value={eth.month} onChange={(e) => setEth({ ...eth, month: +e.target.value })}>
          {ETHIOPIAN_MONTHS.map((m, k) => (
            <option key={m} value={k + 1}>{m}</option>
          ))}
        </select>
        <select aria-label="Year" className="input min-w-0 px-1.5" value={eth.year} onChange={(e) => setEth({ ...eth, year: +e.target.value })}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <input type="hidden" name={name} value={iso} />
      <div className="mt-1 text-xs text-slate-400">GC {iso}</div>
    </div>
  );
}
