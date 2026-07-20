"use client";

import { ErrorState } from "@/components/ui/error-state";

interface WorkspaceErrorProps {
  reset: () => void;
}

export default function WorkspaceError({ reset }: WorkspaceErrorProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4 sm:p-8">
      <ErrorState
        className="bg-background"
        title="We could not load this workspace"
        description="The illustrative workspace hit an unexpected problem. Try loading it again."
        action={
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-[10px] bg-primary-strong px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
            onClick={reset}
          >
            Try again
          </button>
        }
      />
    </main>
  );
}
