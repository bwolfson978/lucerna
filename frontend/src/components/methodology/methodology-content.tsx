import type { OptimizationResult } from "@/lib/types";
// Single source for methodology copy, shared with the backend assistant and MCP
// server (backend/app/content/methodology.json; a backend test keeps them identical).
import methodology from "@/content/methodology.json";

export interface MethodologySection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface ContentBlock {
  heading?: string;
  text: string;
}

interface ContentSection {
  id: string;
  title: string;
  sidebar: boolean;
  blocks: ContentBlock[];
}

const SECTIONS: ContentSection[] = methodology.sections;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-accent">
      {children}
    </h4>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] leading-relaxed text-text-secondary">{children}</p>;
}

export function getSections(_result?: OptimizationResult): MethodologySection[] {
  return SECTIONS.filter((s) => s.sidebar).map((section) => ({
    id: section.id,
    title: section.title,
    content: (
      <>
        {section.blocks.map((block, i) => (
          <div key={i}>
            {block.heading && <SectionHeading>{block.heading}</SectionHeading>}
            <P>{block.text}</P>
          </div>
        ))}
      </>
    ),
  }));
}

export function getSectionLabel(sectionId: string): string {
  return SECTIONS.find((s) => s.id === sectionId)?.title ?? sectionId;
}
