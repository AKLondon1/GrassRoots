import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while a section resolves.
 *
 * The parent sections each make two or three round trips before they can render, and
 * the workspace-root `loading.tsx` only covers navigation into the workspace, not
 * between sections inside it. Without this, switching child or section leaves the
 * previous child's data on screen until the new one arrives, which reads as "nothing
 * happened" and invites a second click.
 *
 * Three cards rather than a spinner, because the sections that matter most are lists
 * of cards and a shape that matches what arrives is less jarring than one that does not.
 */
export default function WorkspaceSectionLoading() {
  return (
    <div className="space-y-4" aria-label="Loading this section">
      {[0, 1, 2].map((index) => (
        <div className="rounded-2xl border border-border-strong bg-background p-5 sm:p-6" key={index}>
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="mt-4 h-6 w-2/3" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
