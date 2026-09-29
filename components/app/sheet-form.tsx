"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";

const CloseSheet = createContext<() => void>(() => {});

/** Forms inside a SheetForm call this after a successful save so the sheet closes itself. */
export const useCloseSheet = () => useContext(CloseSheet);

/** A button that opens a form in a side sheet — create and edit without leaving the page underneath. */
export function SheetForm({ label, icon, title, description, variant = "primary", size = "md", children }: { label: string; icon?: ReactNode; title: string; description?: string; variant?: ButtonVariant; size?: "sm" | "md"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {icon} {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent title={title} description={description}>
          <CloseSheet.Provider value={() => setOpen(false)}>
            <div className="p-5">{children}</div>
          </CloseSheet.Provider>
        </SheetContent>
      </Dialog>
    </>
  );
}
