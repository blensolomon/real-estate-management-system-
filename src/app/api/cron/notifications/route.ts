import { NextResponse } from "next/server";
import { runReminders } from "@/lib/notifications";

/** Call once a day (e.g. 07:00 Addis Ababa) from a scheduler: Authorization: Bearer $CRON_SECRET */
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await runReminders());
}
