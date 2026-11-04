import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { UPLOAD_DIR } from "@/lib/documents";
import { seesAll } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const doc = await db.document.findFirst({ where: { id, companyId: s.companyId }, include: { deal: true } });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  if (!seesAll(s.role) && doc.deal && doc.deal.agentId !== s.userId) return new NextResponse("Forbidden", { status: 403 });
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
