// Ethiopian (Ge'ez) calendar conversion via Julian Day Numbers (Amete Mihret era).
const ETHIOPIAN_EPOCH = 1723856;

export const ETHIOPIAN_MONTHS = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
  "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
];

export const ETHIOPIAN_MONTHS_AM = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
  "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ",
];

export type EthDate = { year: number; month: number; day: number };

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) -
    Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
  );
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

function ethiopianToJdn({ year, month, day }: EthDate): number {
  return ETHIOPIAN_EPOCH + 365 + 365 * (year - 1) + Math.floor(year / 4) + 30 * month + day - 31;
}

function jdnToEthiopian(jdn: number): EthDate {
  const r = (jdn - ETHIOPIAN_EPOCH) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor((jdn - ETHIOPIAN_EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

export function isEthiopianLeapYear(year: number): boolean {
  return year % 4 === 3;
}

export function daysInEthiopianMonth(year: number, month: number): number {
  if (month < 13) return 30;
  return isEthiopianLeapYear(year) ? 6 : 5;
}

/** Converts a JS Date (interpreted in UTC+3, Addis Ababa) to an Ethiopian date. */
export function toEthiopian(date: Date): EthDate {
  const local = new Date(date.getTime() + 3 * 3600 * 1000);
  return jdnToEthiopian(
    gregorianToJdn(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()),
  );
}

/** Returns a Date at 00:00 Addis Ababa time for the given Ethiopian date. */
export function fromEthiopian(eth: EthDate): Date {
  const g = jdnToGregorian(ethiopianToJdn(eth));
  return new Date(Date.UTC(g.year, g.month - 1, g.day) - 3 * 3600 * 1000);
}

export function formatEthiopian(date: Date, opts: { amharic?: boolean } = {}): string {
  const e = toEthiopian(date);
  const months = opts.amharic ? ETHIOPIAN_MONTHS_AM : ETHIOPIAN_MONTHS;
  return `${months[e.month - 1]} ${e.day}, ${e.year}`;
}
