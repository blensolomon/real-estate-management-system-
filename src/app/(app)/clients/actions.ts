"use server";

import type { DocumentType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { back, str } from "@/lib/actions-util";
import { saveDocument, validFile } from "@/lib/documents";

export async function uploadClientDocument(fd: FormData) {
  const s = await requireSession();
  const client = await db.client.findFirst({ where: { id: str(fd, "clientId"), companyId: s.companyId } });
  if (!client) back("/clients", { error: "Client not found" });
  const path = `/clients/${client.id}`;
  const file = fd.get("file");
  if (!validFile(file)) back(path, { error: "Choose a file" });
  const dealId = str(fd, "dealId") || null;
  if (dealId && !(await db.deal.findFirst({ where: { id: dealId, clientId: client.id } }))) back(path, { error: "Invalid deal" });
  try {
    await saveDocument(s, file, str(fd, "type") as DocumentType, { clientId: client.id, dealId });
  } catch (e) {
    back(path, { error: (e as Error).message });
  }
  await audit(s, "document.uploaded", "Client", client.id, file.name);
  back(path, { msg: "Document uploaded" });
}

export async function updateClient(fd: FormData) {
  const s = await requireSession();
  const id = str(fd, "clientId");
  await db.client.updateMany({
    where: { id, companyId: s.companyId },
    data: { fullName: str(fd, "fullName"), email: str(fd, "email") || null, idNumber: str(fd, "idNumber") || null, address: str(fd, "address") || null },
  });
  back(`/clients/${id}`, { msg: "Client updated" });
}
