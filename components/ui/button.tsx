import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondary:
    "bg-muted text-foreground hover:bg-muted/80",
  outline:
    "border border-border bg-background shadow-sm hover:bg-muted",
  ghost: "hover:bg-muted hover:text-foreground",
  destructive:
    "bg-red-600 text-white shadow-sm hover:bg-red-600/90",
};

const buttonSizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-9 w-9",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

/**
 * Minimal `asChild`-capable button. When `asChild` is set the single child is
 * cloned with the button's styles so elements like `<a>` render identically.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "default", size = "default", type, asChild, ...props },
    ref,
  ) {
    const classes = cn(
      "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
      buttonVariants[variant],
      buttonSizes[size],
      className,
    );

    if (asChild) {
      const child = React.Children.only(props.children) as
        | React.ReactElement<{ className?: string }>
        | undefined;
      if (!child) {
        throw new Error("<Button asChild> requiere un solo hijo React.");
      }
      return React.cloneElement(child, {
        className: cn(classes, child.props.className),
      });
    }

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={classes}
        {...props}
      />
    );
  },
);
