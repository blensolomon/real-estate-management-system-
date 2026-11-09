import { NextResponse } from "next/server";
import { runPenalties } from "@/lib/penalties";

/** Call once a day from a scheduler: Authorization: Bearer $CRON_SECRET. Does nothing for companies with penalties off. */
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await runPenalties());
}
