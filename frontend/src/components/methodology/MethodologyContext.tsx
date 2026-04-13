"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface MethodologyState {
  isOpen: boolean;
  activeSection: string | null;
  activeTrigger: string | null;
  openSidebar: (section?: string, trigger?: string) => void;
  closeSidebar: () => void;
}

const MethodologyContext = createContext<MethodologyState | null>(null);

export function MethodologyProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<string | null>(null);

  const openSidebar = useCallback((section?: string, trigger?: string) => {
    setIsOpen(true);
    setActiveSection(section ?? null);
    setActiveTrigger(trigger ?? null);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    setActiveSection(null);
    setActiveTrigger(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeSidebar]);

  return (
    <MethodologyContext.Provider
      value={{ isOpen, activeSection, activeTrigger, openSidebar, closeSidebar }}
    >
      {children}
    </MethodologyContext.Provider>
  );
}

export function useMethodology() {
  const ctx = useContext(MethodologyContext);
  if (!ctx) {
    throw new Error("useMethodology must be used within MethodologyProvider");
  }
  return ctx;
}

export function useMethodologyOptional() {
  return useContext(MethodologyContext);
}
