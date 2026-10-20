
import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  title?: string;
  description?: string;
  headerAction?: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
};

const paddingClasses = {
  none: "p-0",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-7",
};

export default function Card({
  children,
  title,
  description,
  headerAction,
  padding = "md",
  hover = false,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        // Liquid glass + soft neumorphic surface
        "relative overflow-hidden rounded-2xl",
        "border border-white/40 dark:border-white/[0.08]",
        "bg-white/65 dark:bg-slate-900/65",
        "backdrop-blur-xl backdrop-saturate-150",
        "shadow-[0_8px_30px_rgba(15,23,42,0.06)]",
        "dark:shadow-[0_8px_30px_rgba(0,0,0,0.18)]",
        "ring-1 ring-black/[0.02] dark:ring-white/[0.03]",
        "transition-all duration-200",
        hover
          ? "hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(15,23,42,0.10)]"
          : "",
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {(title || description || headerAction) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                {title}
              </h2>
            )}

            {description && (
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>

          {headerAction && (
            <div className="shrink-0">{headerAction}</div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

// Named export for flexible imports
export { Card };
