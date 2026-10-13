import { Fragment, type ReactNode } from "react";

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

type Run = { kind: "ul" | "ol" | "p"; lines: string[] };

/**
 * Minimal markdown for assistant messages: paragraphs, bullet and numbered
 * lists, **bold** and *italic*. Builds React elements directly (no HTML
 * injection), so model output can never become markup.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  let key = 0;
  return (
    <>
      {blocks.flatMap((block) =>
        runs(block).map((run) => {
          if (run.kind === "ul") {
            return (
              <ul key={key++} className="ml-5 list-disc space-y-1 marker:text-sage">
                {run.lines.map((l, j) => (
                  <li key={j}>{inline(l.replace(BULLET, ""))}</li>
                ))}
              </ul>
            );
          }
          if (run.kind === "ol") {
            return (
              <ol key={key++} className="ml-5 list-decimal space-y-1 marker:text-text-tertiary">
                {run.lines.map((l, j) => (
                  <li key={j}>{inline(l.replace(NUMBERED, ""))}</li>
                ))}
              </ol>
            );
          }
          return (
            <p key={key++}>
              {run.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(l.replace(/^#{1,6}\s+/, ""))}
                </Fragment>
              ))}
            </p>
          );
        })
      )}
    </>
  );
}

/**
 * Split one block into paragraph and list runs. The model often puts a lead-in
 * sentence and its list in the same block ("Here is the schedule:\n- 2026 ..."),
 * so a block is not all one kind. An indented line after a list item continues it.
 */
function runs(block: string): Run[] {
  const out: Run[] = [];
  for (const line of block.split("\n")) {
    if (line.trim() === "") continue;
    const kind = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : "p";
    const prev = out[out.length - 1];
    if (kind === "p" && prev && prev.kind !== "p" && /^\s+\S/.test(line)) {
      prev.lines[prev.lines.length - 1] += ` ${line.trim()}`;
    } else if (prev?.kind === kind) {
      prev.lines.push(line);
    } else {
      out.push({ kind, lines: [line] });
    }
  }
  return out;
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
