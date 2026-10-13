import { Fragment, type ReactNode } from "react";
import { Steps, type Step } from "@lucerna/ui";

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

type Run = { kind: "ul" | "ol" | "p"; lines: string[] };

/**
 * Minimal markdown for assistant messages: paragraphs, bullet and numbered
 * lists, **bold** and *italic*. A numbered list whose items each open with a
 * bold title renders as Steps (see the agent's <formatting> prompt section). Builds React elements directly (no HTML
 * injection), so model output can never become markup.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {runs(text).map((run, key) => {
        if (run.kind === "ul") {
          return (
            <ul key={key} className="ml-5 list-disc space-y-1 marker:text-sage">
              {run.lines.map((l, j) => (
                <li key={j}>{inline(l.replace(BULLET, ""))}</li>
              ))}
            </ul>
          );
        }
        if (run.kind === "ol") {
          const items = run.lines.map((l) => l.replace(NUMBERED, ""));
          const steps = asSteps(items);
          if (steps) return <Steps key={key} steps={steps} />;
          return (
            <ol key={key} className="ml-5 list-decimal space-y-1 marker:text-text-tertiary">
              {items.map((l, j) => (
                <li key={j}>{inline(l)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={key}>
            {run.lines.map((l, j) => (
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

/**
 * Split text into paragraph and list runs. A blank line ends a paragraph, but
 * list items stay one list across blank lines ("1. ...\n\n2. ..."). The model
 * often puts a lead-in sentence and its list in the same block ("Here is the
 * schedule:\n- 2026 ..."), so a block is not all one kind. An indented line
 * after a list item continues it.
 */
function runs(text: string): Run[] {
  const out: Run[] = [];
  let blank = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trim() === "") {
      blank = true;
      continue;
    }
    const kind = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : "p";
    const prev = out[out.length - 1];
    if (kind === "p" && !blank && prev && prev.kind !== "p" && /^\s+\S/.test(line)) {
      prev.lines[prev.lines.length - 1] += ` ${line.trim()}`;
    } else if (prev?.kind === kind && (kind !== "p" || !blank)) {
      prev.lines.push(line);
    } else {
      out.push({ kind, lines: [line] });
    }
    blank = false;
  }
  return out;
}

const STEP = /^\*\*([^*]+)\*\*\s*(?:\*([^*\s][^*]*)\*\s*)?(.*)$/;

/**
 * `1. **Title.** *Meta line.* Body` items as steps. Every item must have a
 * bold title, except that the last may still be streaming in.
 */
function asSteps(items: string[]): Step[] | null {
  const parsed = items.map((item) => STEP.exec(item));
  if (items.length < 2 || !parsed[0] || parsed.slice(0, -1).some((m) => !m)) return null;
  return parsed.map((m, i) => {
    if (!m) return { title: null, body: inline(items[i]) };
    const [, title, meta, body] = m;
    return {
      title: title.trim().replace(/[.:]$/, ""),
      meta: meta ? meta.trim().replace(/\.$/, "") : undefined,
      body: body ? inline(body) : undefined,
    };
  });
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
