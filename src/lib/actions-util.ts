import { redirect } from "next/navigation";

export function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

export function num(fd: FormData, k: string) {
  const v = Number(str(fd, k).replaceAll(",", ""));
  return Number.isFinite(v) ? v : NaN;
}

export function back(path: string, params: { msg?: string; error?: string }): never {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

export function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
