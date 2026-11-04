import { NextResponse } from "next/server";
import { expireReservations } from "@/lib/reservations";

/** Call every few minutes from a scheduler: Authorization: Bearer $CRON_SECRET */
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json({ expired: await expireReservations() });
}
