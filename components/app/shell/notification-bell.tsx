"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { popupSurface } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { markAllNotificationsRead, markNotificationRead } from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/queries";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

type Feed = { items: NotificationItem[]; unread: number };
const POLL_MS = 45_000;

/**
 * The bell. Notifications are durable rows; delivery is polling — a light request every 45 seconds
 * and whenever the tab regains focus. Simple, works behind any proxy, and the producers don't know
 * or care how they are delivered.
 */
export function NotificationBell({ items, unread, now, allHref }: { items: NotificationItem[]; unread: number; now: string; allHref: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const props = { items, unread };
  // Re-render from the server (after marking read, navigating) resets to what the server just said.
  const [prev, setPrev] = useState(props);
  const [feed, setFeed] = useState<Feed>(props);
  if (props.items !== prev.items || props.unread !== prev.unread) {
    setPrev(props);
    setFeed(props);
  }
  const announced = useRef(unread);
  const [announcement, setAnnouncement] = useState("");
  const nowDate = new Date(now);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const next = (await res.json()) as Feed;
        setFeed(next);
        if (next.unread > announced.current) setAnnouncement(`${next.unread - announced.current} new notification${next.unread - announced.current === 1 ? "" : "s"}`);
        announced.current = next.unread;
      } catch {
        // Offline or the server is restarting — the next tick tries again.
      }
    };
    const id = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Popover.Root>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      <Tooltip label="Notifications">
        <Popover.Trigger
          aria-label={feed.unread ? `Notifications, ${feed.unread} unread` : "Notifications"}
          className="relative flex size-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface-hover hover:text-primary data-popup-open:bg-surface-hover"
        >
          <Bell className="size-4" />
          {feed.unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-semibold leading-3.5 text-white">
              {feed.unread > 9 ? "9+" : feed.unread}
            </span>
          )}
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-50">
          <Popover.Popup className={cn(popupSurface, "flex max-h-[min(32rem,80dvh)] w-[min(24rem,calc(100vw-1rem))] flex-col")}>
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <Popover.Title className="text-heading text-primary">Notifications</Popover.Title>
              {feed.unread > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => markAllNotificationsRead())}
                  className="rounded text-compact font-medium text-brand-text hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>
            {feed.items.length === 0 ? (
              <p className="px-4 py-10 text-center text-body text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="overflow-y-auto py-1">
                {feed.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read) startTransition(() => markNotificationRead(n.id));
                        if (n.href) router.push(n.href);
                      }}
                      className="flex w-full gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
                    >
                      <span className="mt-1.5 flex size-2 shrink-0 items-center justify-center">{!n.read && <span className="size-2 rounded-full bg-brand" aria-label="Unread" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-body font-medium text-primary">
                          {n.kind === "action" && <CircleAlert className="size-3.5 shrink-0 text-warning" aria-label="Action required" />}
                          <span className="truncate">{n.title}</span>
                        </span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-compact text-secondary">{n.body}</span>}
                        <span className="mt-1 block text-meta text-muted">{formatRelative(n.createdAt, nowDate)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border px-4 py-2">
              <Link href={allHref} className="text-compact font-medium text-brand-text hover:underline">
                See all notifications
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
