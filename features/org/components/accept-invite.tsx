"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "../actions";

export function AcceptInvite({ token, orgName }: { token: string; orgName: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="primary"
        size="lg"
        pending={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitation(token);
            // On success the action redirects; anything returned is a problem to show.
            if (res?.error) setError(res.error);
          })
        }
      >
        Join {orgName}
      </Button>
      {error && (
        <p role="alert" className="text-compact text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
