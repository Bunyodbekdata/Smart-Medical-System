import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[-0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B4F8A]/35 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#0B4F8A] text-white shadow-[0_1px_2px_rgba(10,22,40,0.2),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-[#083D6B] active:scale-[0.99]",
        secondary:
          "bg-[#EDF4FA] text-[#0B4F8A] border border-[#CFE1F2] hover:bg-[#E1EEF9] hover:border-[#B9D4EC]",
        outline:
          "border border-slate-200/90 bg-white text-slate-700 shadow-[0_1px_2px_rgba(10,22,40,0.04)] hover:border-slate-300 hover:bg-slate-50/80 hover:text-slate-950",
        success:
          "bg-teal-600 text-white shadow-[0_1px_2px_rgba(13,148,136,0.25)] hover:bg-teal-700 active:scale-[0.99]",
        destructive:
          "bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:scale-[0.99]",
        ghost:
          "text-slate-600 hover:bg-slate-100/90 hover:text-slate-950",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8.5 rounded-lg px-3 text-xs",
        lg: "h-11.5 rounded-xl px-6 text-[15px]",
        icon: "h-9.5 w-9.5",
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
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
