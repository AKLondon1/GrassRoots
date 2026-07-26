import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <main
      className="min-h-dvh bg-surface px-4 py-6 sm:px-8 sm:py-10"
      aria-label="Loading workspace"
    >
      <div className="mx-auto max-w-5xl">
        <Skeleton className="h-11 w-48" />
        <div className="mt-12 space-y-4">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </main>
  );
}
