"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import {
  getScreenHref,
  type AppRole,
  type ScreenDefinition,
} from "@/lib/navigation/screen-registry";

interface CommandMenuProps {
  role: AppRole;
  screens: readonly ScreenDefinition[];
  workspace: string;
}

function CommandMenu({ role, screens, workspace }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dialogId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const normalisedQuery = query.trim().toLowerCase();
  const results = screens.filter((screen) =>
    screen.label.toLowerCase().includes(normalisedQuery),
  );

  const closeMenu = (restoreTriggerFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreTriggerFocus) triggerRef.current?.focus();
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Search screens"
        aria-controls={dialogId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-surface focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Search screens</span>
        <span className="sm:hidden">Search</span>
      </button>

      {open ? (
        <section
          ref={dialogRef}
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-x-4 top-20 z-50 mx-auto max-w-lg rounded-2xl border border-border-strong bg-background p-4 shadow-[0_8px_8px_oklch(0.2_0.025_210/0.12)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-13 sm:w-[28rem]"
          onKeyDown={handleDialogKeyDown}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              Find a screen
            </h2>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-strong hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
              aria-label="Close screen search"
              onClick={() => closeMenu()}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-2 rounded-[10px] border border-border-strong px-3 focus-within:ring-3 focus-within:ring-ring/35">
            <Search className="size-4 text-muted" aria-hidden="true" />
            <span className="sr-only">Search registered screens</span>
            <input
              autoFocus
              type="search"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              placeholder="Type a screen name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {results.map((screen) => (
              <li key={screen.id}>
                <Link
                  href={getScreenHref(workspace, screen, role)}
                  className="flex min-h-11 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
                  onClick={() => closeMenu(false)}
                >
                  <span>{screen.label}</span>
                  <span className="text-xs text-muted" aria-hidden="true">
                    {screen.componentKind}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              No screen matches that search.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export { CommandMenu };
