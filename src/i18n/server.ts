import "server-only";
import { getSession } from "@/lib/session";
import { translator } from ".";

export async function getT() {
  const s = await getSession();
  return translator(s?.locale);
}
