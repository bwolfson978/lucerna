import { Fragment, type ReactNode } from "react";

/**
 * Minimal markdown for assistant messages: paragraphs, bullet and numbered
 * lists, **bold** and *italic*. Builds React elements directly (no HTML
 * injection), so model output can never become markup.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length === 0) return null;
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="ml-5 list-disc space-y-1 marker:text-sage">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={i} className="ml-5 list-decimal space-y-1 marker:text-text-tertiary">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#{1,6}\s+/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      out.push(
        <strong key={key++} className="font-semibold text-text-primary">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
