"use client";

import { createContext, useContext, useMemo } from "react";
import { translator, type T } from ".";

const Ctx = createContext<T>(translator("en"));

export function I18nProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  const t = useMemo(() => translator(locale), [locale]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
