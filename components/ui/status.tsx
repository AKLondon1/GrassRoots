import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Info,
  type LucideIcon,
  ShieldAlert,
} from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-strong text-ink",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
};

const toneIcons: Record<StatusTone, LucideIcon> = {
  neutral: CircleHelp,
  success: CircleCheck,
  warning: CircleAlert,
  danger: ShieldAlert,
  info: Info,
};

export interface StatusProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  icon?: LucideIcon;
}

function Status({
  tone = "neutral",
  icon: Icon = toneIcons[tone],
  className,
  children,
  ...props
}: StatusProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
      data-tone={tone}
      {...props}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      {children}
    </span>
  );
}

export { Status, type StatusTone };
