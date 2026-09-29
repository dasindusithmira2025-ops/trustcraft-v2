import type { Metadata } from "next";
import { NotificationCenter } from "@/features/notifications/components/notification-center";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Notifications" };

export default async function FieldNotificationsPage({ searchParams }: PageProps<"/field/notifications">) {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-primary">Notifications</h1>
      <NotificationCenter userId={user.id} path="/field/notifications" params={await searchParams} now={new Date().toISOString()} />
    </div>
  );
}
