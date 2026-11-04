import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DocumentType, Prisma } from "@prisma/client";
import { db } from "./db";
import type { Session } from "./session";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

export function validFile(f: FormDataEntryValue | null): f is File {
  return f instanceof File && f.size > 0;
}

/** Stores an uploaded file under the company's folder and records it. */
export async function saveDocument(
  s: Session,
  file: File,
  type: DocumentType,
  link: { clientId?: string | null; dealId?: string | null },
  tx: Prisma.TransactionClient = db,
) {
  if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB");
  if (!ALLOWED.includes(file.type)) throw new Error("Only PDF and image files are allowed");
  const dir = path.join(UPLOAD_DIR, s.companyId);
  await mkdir(dir, { recursive: true });
  const ext = path.extname(file.name).slice(0, 10).replace(/[^.\w]/g, "");
  const storagePath = path.join(s.companyId, `${randomUUID()}${ext}`);
  await writeFile(path.join(UPLOAD_DIR, storagePath), Buffer.from(await file.arrayBuffer()));
  return tx.document.create({
    data: {
      companyId: s.companyId,
      type,
      fileName: file.name.slice(0, 200),
      storagePath,
      mimeType: file.type,
      size: file.size,
      clientId: link.clientId ?? null,
      dealId: link.dealId ?? null,
      uploadedById: s.userId,
    },
  });
}
