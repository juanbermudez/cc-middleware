import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-[var(--badge-default-border)] bg-[var(--badge-default-bg)] text-[var(--badge-default-ink)]",
        success: "border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--badge-success-ink)]",
        warning: "border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] text-[var(--badge-warning-ink)]",
        destructive: "border-[var(--badge-destructive-border)] bg-[var(--badge-destructive-bg)] text-[var(--badge-destructive-ink)]",
        info: "border-[var(--badge-info-border)] bg-[var(--badge-info-bg)] text-[var(--badge-info-ink)]",
        outline: "border-[var(--field-border)] bg-[var(--surface-strong)] text-[var(--page-soft-ink)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
