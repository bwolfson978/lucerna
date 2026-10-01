import Link from "next/link";
import { cn } from "@/lib/utils";

/** Serif site wordmark with the pine period. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Roth Conversion Optimizer home"
      className={cn(
        "whitespace-nowrap font-serif text-[1.12rem] font-bold leading-none tracking-[-0.01em] text-text-primary sm:text-[1.4rem]",
        className
      )}
    >
      Roth Conversion Optimizer<span className="text-pine-mid">.</span>
    </Link>
  );
}
