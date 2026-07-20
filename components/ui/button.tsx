import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-5 text-sm font-semibold transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-strong text-primary-foreground hover:bg-ink active:bg-ink",
        secondary:
          "border border-border-strong bg-background text-ink hover:border-primary hover:bg-surface active:bg-surface-strong",
        quiet: "text-ink hover:bg-surface-strong active:bg-border",
        danger:
          "bg-danger text-primary-foreground hover:bg-danger-strong active:bg-danger-strong",
      },
      size: {
        default: "min-h-12",
        small: "min-h-11 px-4",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

function Button({
  asChild = false,
  className,
  children,
  disabled,
  loading = false,
  loadingLabel = "Working",
  size,
  variant,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ size, variant }), className);

  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}

export { Button, buttonVariants };
