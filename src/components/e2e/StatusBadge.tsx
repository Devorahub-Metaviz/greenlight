import { CircleCheck, CircleDashed, CircleSlash, CircleX, Loader2 } from "lucide-react";
import type { TestStatus, Priority } from "@/lib/e2e-mock";
import { cn } from "@/lib/utils";

type Meta = { label: string; text: string; bg: string; Icon: typeof CircleCheck; spin?: boolean };

const statusMap: Record<TestStatus, Meta> = {
  passed: {
    label: "passed",
    text: "text-[var(--color-success)]",
    bg: "bg-[color-mix(in_oklab,var(--color-success)_14%,transparent)]",
    Icon: CircleCheck,
  },
  failed: {
    label: "failed",
    text: "text-destructive",
    bg: "bg-[color-mix(in_oklab,var(--color-destructive)_14%,transparent)]",
    Icon: CircleX,
  },
  running: {
    label: "running",
    text: "text-[var(--color-warning)]",
    bg: "bg-[color-mix(in_oklab,var(--color-warning)_18%,transparent)]",
    Icon: Loader2,
    spin: true,
  },
  skipped: {
    label: "skipped",
    text: "text-muted-foreground",
    bg: "bg-muted",
    Icon: CircleSlash,
  },
  unknown: {
    label: "not run",
    text: "text-muted-foreground",
    bg: "bg-muted",
    Icon: CircleDashed,
  },
};

// A bare status icon (used where a small inline indicator is needed).
export function StatusDot({ status, className }: { status: TestStatus; className?: string }) {
  const s = statusMap[status];
  return <s.Icon className={cn("h-3.5 w-3.5", s.text, s.spin && "animate-spin", className)} strokeWidth={2.25} />;
}

export function StatusBadge({ status }: { status: TestStatus }) {
  const s = statusMap[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", s.bg, s.text)}>
      <s.Icon className={cn("h-3.5 w-3.5", s.spin && "animate-spin")} strokeWidth={2.25} />
      {s.label}
    </span>
  );
}

const priorityMap: Record<Priority, string> = {
  high: "bg-[color-mix(in_oklab,var(--color-destructive)_14%,transparent)] text-destructive",
  medium: "bg-[color-mix(in_oklab,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]",
  low: "bg-[color-mix(in_oklab,var(--color-success)_14%,transparent)] text-[var(--color-success)]",
};

export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        priorityMap[priority],
      )}
    >
      {priority}
    </span>
  );
}
