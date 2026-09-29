"use client";

import { Car, CircleCheck, WifiOff } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { newOpId } from "@/features/media/upload-client";
import { startTravel } from "../actions";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Says out loud when the phone has no connection, and what that means for what they're doing. */
export function ConnectionBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="sticky top-14 z-20 flex items-start gap-2.5 border-b border-warning/30 bg-warning-subtle px-4 py-2.5 text-compact text-primary">
      <WifiOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <span className="font-medium">You&apos;re offline.</span> Photos wait on this phone and send when you&apos;re back online. Job changes need a connection — don&apos;t close this page until photos have sent.
      </p>
    </div>
  );
}

/** "On my way" — tells the customer and dispatch travel has started. One tap, safe to press twice. */
export function TravelButton({ workOrderId, since }: { workOrderId: string; since: string | null }) {
  const [pending, start] = useTransition();
  const [opId] = useState(newOpId);
  const [error, setError] = useState<string>();
  if (since) {
    return (
      <p className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-subtle px-4 text-body font-medium text-brand-text">
        <CircleCheck className="size-5" aria-hidden /> On the way since {since}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="xl"
        variant="secondary"
        pending={pending}
        onClick={() =>
          start(async () => {
            const res = await startTravel(workOrderId, opId);
            setError(res.error);
          })
        }
      >
        <Car aria-hidden /> On my way
      </Button>
      {error && (
        <p role="alert" className="text-compact text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
