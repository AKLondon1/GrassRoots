"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

interface StateMessageProps {
  action?: ReactNode;
  className?: string;
  description: string;
  icon: LucideIcon;
  title: string;
  tone?: "neutral" | "danger" | "info";
}

const toneClasses = {
  neutral: "bg-surface-strong text-muted",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
};

function StateMessage({
  action,
  className,
  description,
  icon: Icon,
  title,
  tone = "neutral",
}: StateMessageProps) {
  const titleId = `state-${useId()}`;

  return (
    <section
      className={cn(
        "flex max-w-xl flex-col items-start rounded-2xl border border-border p-6 sm:p-8",
        className,
      )}
      aria-labelledby={titleId}
    >
      <span
        className={cn(
          "mb-5 inline-flex size-10 items-center justify-center rounded-xl",
          toneClasses[tone],
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2
        id={titleId}
        className="text-xl font-semibold tracking-[-0.02em] text-ink"
      >
        {title}
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

export { StateMessage, type StateMessageProps };
