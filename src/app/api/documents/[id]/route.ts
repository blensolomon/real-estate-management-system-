import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { UPLOAD_DIR } from "@/lib/documents";
import { FINANCE_VIEW, seesAll } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  if (!FINANCE_VIEW.includes(s.role)) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const doc = await db.document.findFirst({ where: { id, companyId: s.companyId }, include: { deal: true, client: { include: { lead: true, deals: { select: { agentId: true } }, reservations: { select: { agentId: true } } } } } });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  if (!seesAll(s.role)) {
    const c = doc.client;
    const ownsClient = !!c && (c.lead?.ownerId === s.userId || c.deals.some((d) => d.agentId === s.userId) || c.reservations.some((r) => r.agentId === s.userId));
    if (doc.deal ? doc.deal.agentId !== s.userId : !ownsClient) return new NextResponse("Forbidden", { status: 403 });
  }
  const full = path.join(UPLOAD_DIR, doc.storagePath);
  if (!full.startsWith(UPLOAD_DIR)) return new NextResponse("Not found", { status: 404 });
  const data = await readFile(full);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
    },
  });
}
