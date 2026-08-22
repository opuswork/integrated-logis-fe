import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

export type SpinnerSize = keyof typeof sizeClass;

export type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
  label?: string;
};

/** Small loading indicator for buttons and inline UI. Inherits `currentColor`. */
export function Spinner({
  size = "sm",
  className,
  label = "로딩 중",
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex shrink-0", className)}
    >
      <svg
        className={cn("animate-spin", sizeClass[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V2C5.373 2 2 5.373 2 12h2zm2 5.291A7.962 7.962 0 014 12H2c0 3.042 1.135 5.824 3 7.938l1-2.647z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
