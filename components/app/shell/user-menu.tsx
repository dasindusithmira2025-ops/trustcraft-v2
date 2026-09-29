"use client";

import { LogOut, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLink, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { signOut } from "@/features/auth/actions";

type Theme = "system" | "light" | "dark";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("tc-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("tc-theme");
    else localStorage.setItem("tc-theme", theme);
  } catch {
    // Storage blocked (private mode) — the choice still applies for this page view.
  }
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  return (
    <Menu onOpenChange={(open) => open && setTheme(readTheme())}>
      <MenuTrigger aria-label="Account menu" className="rounded-full transition-opacity hover:opacity-85">
        <Avatar name={name} size="md" />
      </MenuTrigger>
      <MenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-body font-medium text-primary">{name}</p>
          <p className="truncate text-meta text-muted">{email}</p>
        </div>
        <MenuSeparator />
        <MenuGroup label="Appearance">
          <MenuRadioGroup
            value={theme}
            onValueChange={(value: Theme) => {
              setTheme(value);
              applyTheme(value);
            }}
          >
            <MenuRadioItem value="system" closeOnClick={false}>
              <Monitor /> System
            </MenuRadioItem>
            <MenuRadioItem value="light" closeOnClick={false}>
              <Sun /> Light
            </MenuRadioItem>
            <MenuRadioItem value="dark" closeOnClick={false}>
              <Moon /> Dark
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuLink href="/account">
          <ShieldCheck /> Account and security
        </MenuLink>
        <MenuItem onClick={() => void signOut()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
