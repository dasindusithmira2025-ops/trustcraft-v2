"use client";

import { useEffect } from "react";

/**
 * React 19 resets a form's fields after every form action — even when the server rejected the input,
 * which wipes what the person typed and makes them start again. The reset is a cancelable DOM event,
 * so we cancel it everywhere except forms that opt in (`data-reset`), like "add a note", which should
 * clear once the note is saved.
 */
export function KeepFormState() {
  useEffect(() => {
    const keep = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (form && !form.hasAttribute("data-reset")) e.preventDefault();
    };
    document.addEventListener("reset", keep, true);
    return () => document.removeEventListener("reset", keep, true);
  }, []);
  return null;
}
