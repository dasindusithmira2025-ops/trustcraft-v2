import { NextResponse } from "next/server";
import { getNotifications } from "@/features/notifications/queries";
import { generateSlaNotifications } from "@/features/notifications/sla";
import { getUser } from "@/lib/auth/session";

/**
 * What the bell polls: the caller's own latest notifications and unread count. Polling is the
 * whole delivery mechanism today — cheap, works everywhere, and the producers never know about it.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await generateSlaNotifications(user.id);
  return NextResponse.json(await getNotifications(user.id), { headers: { "cache-control": "no-store" } });
}
