"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function Header() {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-bg/80 backdrop-blur-md",
        "border-b border-border h-14 flex items-center px-section md:px-page"
      )}
    >
      <div className="w-full max-w-content mx-auto flex items-center justify-between">
        <Link href="/" className="font-serif text-[18px] font-bold text-text-primary tracking-tight">
          Lucerna
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            href="/demo"
            className="text-body-sm text-text-secondary hover:text-accent transition-colors duration-300"
          >
            Demo
          </Link>
          <Link
            href="/calculator"
            className="text-body-sm text-text-secondary hover:text-accent transition-colors duration-300"
          >
            Planner
          </Link>
        </nav>
      </div>
    </header>
  );
}
