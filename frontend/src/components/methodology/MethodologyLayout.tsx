"use client";

import { cn } from "@/lib/utils";
import { useMethodology } from "./MethodologyContext";
import { MethodologySidebar } from "./MethodologySidebar";
import type { OptimizationResult } from "@/lib/types";

interface MethodologyLayoutProps {
  result?: OptimizationResult;
  children: React.ReactNode;
}

/**
 * Page-level layout that manages the flex relationship between
 * main content and the methodology sidebar.
 *
 * Desktop: sidebar is a flex sibling — content shrinks naturally.
 * Mobile: sidebar overlays as a drawer (no layout shift).
 */
export function MethodologyLayout({ result, children }: MethodologyLayoutProps) {
  const { isOpen } = useMethodology();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Main content area — shrinks when sidebar is open on desktop */}
      <div
        className={cn(
          "min-w-0 flex-1 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        )}
      >
        {children}
      </div>

      {/* Sidebar — flex sibling on desktop, fixed overlay on mobile.
          No overflow clipping on the wrapper — that would break sticky.
          The sidebar handles its own sticky positioning. The wrapper
          just animates width to push/pull the main content. */}
      <div
        className={cn(
          "hidden lg:block",
          "shrink-0",
          "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isOpen ? "w-[400px]" : "w-0"
        )}
        aria-hidden={!isOpen}
      >
        <MethodologySidebar result={result} />
      </div>

      {/* Mobile: sidebar renders as fixed overlay (handled inside MethodologySidebar) */}
      <div className="lg:hidden">
        <MethodologySidebar result={result} mobile />
      </div>
    </div>
  );
}
