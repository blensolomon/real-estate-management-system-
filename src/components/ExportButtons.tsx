"use client";

import { useSearchParams } from "next/navigation";
import { useT } from "@/i18n/client";

/** "Excel" downloads the report with the current filters; "PDF" opens the print dialog (Save as PDF). */
export function ExportButtons({ report }: { report: string }) {
  const t = useT();
  const sp = useSearchParams();
  const qs = sp.toString();
  return (
    <div className="flex gap-2 print:hidden">
      <a href={`/api/export/${report}${qs ? `?${qs}` : ""}`} className="btn-secondary">{t("Excel")}</a>
      <button type="button" onClick={() => window.print()} className="btn-secondary">{t("PDF")}</button>
    </div>
  );
}
