"use server";

import type { DocumentType } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { back, str } from "@/lib/actions-util";
import { saveDocument, validFile } from "@/lib/documents";
import { guardCompanyAction, logCompanyAudit } from "@/lib/permission-guards";

export async function uploadClientDocument(fd: FormData) {
  // Guard: Check permission to edit deals
  const guard = await guardCompanyAction("EDIT_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const clientId = str(fd, "clientId");
  const client = await db.client.findFirst({ where: { id: clientId, companyId: s.companyId } });
  if (!client) back("/clients", { error: "Client not found" });
  const path = `/clients/${client.id}`;
  const file = fd.get("file");
  if (!validFile(file)) back(path, { error: "Choose a file" });
  const dealId = str(fd, "dealId") || null;
  if (dealId && !(await db.deal.findFirst({ where: { id: dealId, clientId: client.id } }))) back(path, { error: "Invalid deal" });
  try {
    await saveDocument(s, file, str(fd, "type") as DocumentType, { clientId: client.id, dealId });
    await logCompanyAudit(s.companyId, s.userId, "EDIT_DEAL", "Client", client.id, `Document uploaded: ${file.name}`);
  } catch (e) {
    back(path, { error: (e as Error).message });
  }
  back(path, { msg: "Document uploaded" });
}

export async function updateClient(fd: FormData) {
  // Guard: Check permission to edit deals
  const guard = await guardCompanyAction("EDIT_DEAL");
  
  const s = await getSession();
  if (!s) throw new Error("Session not found");
  
  const id = str(fd, "clientId");
  const client = await db.client.findFirst({ where: { id, companyId: s.companyId } });
  if (!client) back("/clients", { error: "Client not found" });
  
  await db.client.updateMany({
    where: { id, companyId: s.companyId },
    data: { fullName: str(fd, "fullName"), email: str(fd, "email") || null, idNumber: str(fd, "idNumber") || null, address: str(fd, "address") || null },
  });
  await logCompanyAudit(s.companyId, s.userId, "EDIT_DEAL", "Client", id, `Client updated: ${str(fd, "fullName")}`);
  back(`/clients/${id}`, { msg: "Client updated" });
}
