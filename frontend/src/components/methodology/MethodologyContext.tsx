"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface MethodologyState {
  isOpen: boolean;
  activeSection: string | null;
  activeTrigger: string | null;
  /** The question on the trigger that opened the sidebar, if any. */
  activeQuestion: string | null;
  openSidebar: (section?: string, trigger?: string, question?: string) => void;
  closeSidebar: () => void;
  /** Ask the assistant about a topic. Present only where a conversation exists. */
  askAbout?: (question: string) => void;
}

const MethodologyContext = createContext<MethodologyState | null>(null);

export function MethodologyProvider({
  children,
  askAbout,
}: {
  children: ReactNode;
  askAbout?: (question: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  const openSidebar = useCallback((section?: string, trigger?: string, question?: string) => {
    setIsOpen(true);
    setActiveSection(section ?? null);
    setActiveTrigger(trigger ?? null);
    setActiveQuestion(question ?? null);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    setActiveSection(null);
    setActiveTrigger(null);
    setActiveQuestion(null);
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
      value={{
        isOpen,
        activeSection,
        activeTrigger,
        activeQuestion,
        openSidebar,
        closeSidebar,
        askAbout,
      }}
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
