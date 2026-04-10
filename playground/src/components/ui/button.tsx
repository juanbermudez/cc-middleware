import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-offset)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--button-primary-bg)] text-[var(--button-primary-ink)] hover:bg-[var(--button-primary-hover)]",
        secondary: "bg-[var(--button-secondary-bg)] text-[var(--page-ink)] ring-1 ring-[var(--panel-border-strong)] hover:bg-[var(--button-secondary-hover)]",
        outline: "border border-[var(--field-border)] bg-transparent text-[var(--page-soft-ink)] hover:bg-[var(--surface-soft)]",
        ghost: "bg-transparent text-[var(--page-muted)] hover:bg-[var(--ghost-hover)] hover:text-[var(--page-ink)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
