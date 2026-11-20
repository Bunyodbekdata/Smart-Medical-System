import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-[#0A1628] shadow-[0_1px_2px_rgba(10,22,40,0.02)] transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0B4F8A] focus:outline-none focus:ring-3 focus:ring-[#0B4F8A]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[84px] w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-[#0A1628] shadow-[0_1px_2px_rgba(10,22,40,0.02)] transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0B4F8A] focus:outline-none focus:ring-3 focus:ring-[#0B4F8A]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

const SelectInput = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-[#0A1628] shadow-[0_1px_2px_rgba(10,22,40,0.02)] transition-all hover:border-slate-300 focus:border-[#0B4F8A] focus:outline-none focus:ring-3 focus:ring-[#0B4F8A]/12 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  );
});
SelectInput.displayName = "SelectInput";

export { Input, Textarea, SelectInput };
