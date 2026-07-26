import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      className={cn("skeleton min-h-4 rounded-lg bg-surface-strong", className)}
      {...props}
    />
  );
}

export { Skeleton };
