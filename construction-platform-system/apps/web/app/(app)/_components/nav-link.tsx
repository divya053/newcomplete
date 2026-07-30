"use client";

import { cn } from "@ci/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Sidebar nav item with active-route highlighting. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "relative rounded-md px-2.5 py-1.5 text-sm transition-all",
        active
          ? "bg-primary/10 font-medium text-primary before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-primary"
          : "text-foreground/80 hover:translate-x-0.5 hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
