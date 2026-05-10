"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const APP_NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/runs", label: "Runs" },
  { href: "/costs", label: "Costs" },
  { href: "/testing", label: "Testing" },
  { href: "/settings", label: "Settings" }
];
export const LOGOUT_ACTION = "/api/auth/logout";

export function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-[#dbe4de] bg-[#f7f8f3]/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link className="flex min-w-0 items-center gap-3 font-black text-[#15201c]" href="/dashboard" onClick={() => setOpen(false)}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#176b5b] text-sm text-white">F</span>
          <span className="truncate">FishBot</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={open}
            aria-controls="app-navigation-menu"
            className="grid h-10 w-10 place-items-center rounded-md border border-[#dbe4de] bg-white text-[#15201c] shadow-sm hover:bg-[#eff7f2]"
            onClick={() => setOpen((value) => !value)}
          >
            <Menu size={20} />
          </button>

          {open ? (
            <div
              id="app-navigation-menu"
              className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-[#dbe4de] bg-white py-2 shadow-lg"
            >
              {APP_NAV_LINKS.map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={[
                      "block px-4 py-2.5 text-sm font-bold",
                      active ? "bg-[#eff7f2] text-[#176b5b]" : "text-[#15201c] hover:bg-[#f7f8f3]"
                    ].join(" ")}
                    href={link.href}
                    key={link.href}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <div className="my-2 border-t border-[#dbe4de]" />
              <form action={LOGOUT_ACTION} method="post">
                <button className="block w-full px-4 py-2.5 text-left text-sm font-bold text-[#b42318] hover:bg-[#fff8f8]" type="submit">
                  Logout
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
