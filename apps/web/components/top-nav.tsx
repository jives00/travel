"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Nav order per travel-feature-spec.md "Navigation", with Home added ahead of
// schedule (the spec's Today screen, effectively — built early since it only
// needed trips/legs/itinerary, not Bookings). Itinerary has no standalone nav
// entry — it's embedded directly on each trip's page. Bookings/Journal/Prep/
// Documents/Stats all land with their own later slices.
const NAV_LINKS = [
  { href: "/home", label: "Home" },
  { href: "/trips", label: "Trips" },
  { href: "/map", label: "Map" },
  { href: "/lists", label: "Lists" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const { logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-10 flex h-16 items-center gap-6 border-b border-gridline bg-[#323440] px-4 dark:bg-surface">
      {/* Placeholder wordmark in a cursive font until a real logo lands */}
      <span className="text-xl text-white" style={{ fontFamily: "cursive" }}>
        Travel
      </span>
      <nav className="hidden flex-1 items-center gap-1 md:flex">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Fragment key={link.href}>
              {link.href === "/settings" && (
                <a
                  key="photos"
                  href="https://photos.google.com/albums"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded px-3 py-2 text-sm text-white/70 hover:text-white"
                >
                  Photos
                </a>
              )}
              <Link
                href={link.href}
                className={`rounded px-3 py-2 text-sm ${
                  active ? "bg-white/10 font-medium text-white" : "text-white/70 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            </Fragment>
          );
        })}
      </nav>
      <button onClick={() => logout()} className="ml-auto text-sm text-white/70 hover:text-white">
        Log out
      </button>
    </header>
  );
}
