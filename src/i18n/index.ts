import { am } from "./am";

export type Locale = "en" | "am";
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "am", label: "አማርኛ (Amharic)" },
];

export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

const DICTS: Record<Locale, Record<string, string>> = { en: {}, am };

/**
 * Gettext-style translator: the English text is the key, so English needs no dictionary.
 * Other locales fall back to English for any phrase not yet translated.
 * Placeholders use {name}: t("{n} buyers late", { n: 3 }).
 */
export function translator(locale: string | undefined): T {
  const dict = DICTS[(locale as Locale) ?? "en"] ?? {};
  return (text, vars) => {
    const s = dict[text] ?? text;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;
  };
}

/** Translate an enum value like SITE_VISIT via its English label ("Site visit"). */
export function enumLabel(t: T, v: string) {
  return t(ENUM_LABELS[v] ?? v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " "));
}

const ENUM_LABELS: Record<string, string> = {
  OWNER: "Owner", MANAGER: "Sales Manager", AGENT: "Agent / Broker", ACCOUNTANT: "Accountant", ADMIN: "Admin",
  WALK_IN: "Walk-in", TIKTOK: "TikTok", CBE_BIRR: "CBE Birr", TELEBIRR: "Telebirr", BANK_TRANSFER: "Bank transfer",
  SITE_VISIT: "Site visit", ID: "ID", PAID: "Paid", APPROVED: "Approved, not paid",
};
