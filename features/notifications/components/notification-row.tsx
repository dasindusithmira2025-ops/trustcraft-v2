"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/queries";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function NotificationRow({ item: n, now, kindLabel }: { item: NotificationItem; now: string; kindLabel: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (!n.read) start(() => markNotificationRead(n.id));
          if (n.href) router.push(n.href);
        }}
        className={cn("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover", !n.read && "bg-brand-subtle/30")}
      >
        <span className="mt-2 flex size-2 shrink-0 items-center justify-center">{!n.read && <span className="size-2 rounded-full bg-brand" aria-label="Unread" />}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-body font-medium text-primary">
            {n.kind === "action" && <CircleAlert className="size-3.5 shrink-0 text-warning" aria-label="Action required" />}
            <span className="truncate">{n.title}</span>
          </span>
          {n.body && <span className="mt-0.5 block text-compact text-secondary">{n.body}</span>}
          <span className="mt-1 block text-meta text-muted">
            {kindLabel} · {formatRelative(n.createdAt, new Date(now))}
          </span>
        </span>
      </button>
    </li>
  );
}

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" size="sm" pending={pending} onClick={() => start(() => markAllNotificationsRead())}>
      Mark all read
    </Button>
  );
}
