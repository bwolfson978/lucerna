import Link from "next/link";
import { cn } from "@/lib/utils";

/** "lucerna." serif wordmark with the pine period. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Lucerna home"
      className={cn(
        "font-serif text-[1.55rem] font-bold leading-none tracking-[-0.01em] text-text-primary",
        className
      )}
    >
      lucerna<span className="text-pine-mid">.</span>
    </Link>
  );
}
