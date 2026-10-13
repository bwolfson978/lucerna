"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { UiMessage, UiPart } from "@/lib/agent/types";
import { cn } from "@/lib/utils";
import type { ConversationState } from "@/lib/agent/conversation";
import { Markdown } from "./Markdown";
import { usePrefersReducedMotion } from "@/hooks/useInView";
import { McpAppFrame } from "./parts/McpAppFrame";
import { PartBoundary } from "./parts/PartBoundary";
import { ScenarioSummaryCard } from "./parts/ScenarioSummaryCard";
import {
  BalanceComparisonCard,
  ResultHeadlineCard,
  ScenarioCompareCard,
  SuggestionChips,
} from "./parts/ResultCards";

/** Screen height the header, composer and margins take: what the latest turn needn't fill. */
const TURN_ROOM = 192;

/** Index of the summary card that can still be edited and run, if any. */
function activeSummaryKey(messages: UiMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const kind = parts[j].kind;
      if (kind === "result_headline" || kind === "mcp_app") return null;
      if (kind === "scenario_summary") return `${messages[i].id}:${j}`;
    }
  }
  return null;
}

export function ConversationThread({
  state,
  intro,
  followKey = 0,
  followOnRestore = false,
}: {
  state: ConversationState;
  /** Shown above the messages (the assistant's opening line). */
  intro?: ReactNode;
  /**
   * Bumped for each message the person sends from this page. The new message scrolls
   * to the top with room below it for the reply, as in a chat app. Messages added any
   * other way (a demo replay) leave the scroll position alone.
   */
  followKey?: number;
  /** Bring the last message into view when a saved conversation is restored. */
  followOnRestore?: boolean;
}) {
  const { messages, streaming, status } = state;
  const activeSummary = activeSummaryKey(messages);
  const lastUserRef = useRef<HTMLDivElement | null>(null);
  const userCount = messages.filter((m) => m.role === "user").length;
  const prevCount = useRef(userCount);
  const prevFollow = useRef(followKey);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const added = userCount > prevCount.current;
    const sent = added && followKey !== prevFollow.current;
    const restored = added && !sent && prevCount.current === 0 && followOnRestore;
    prevCount.current = userCount;
    prevFollow.current = followKey;
    if (!(sent || restored) || !lastUserRef.current) return;
    lastUserRef.current.scrollIntoView({
      behavior: sent && !reducedMotion ? "smooth" : "auto",
      block: "start",
    });
  }, [userCount, followKey, followOnRestore, reducedMotion]);

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  // The turn just sent fills the screen, so its question can sit at the top while the
  // reply arrives below it instead of behind the message box. A spacer after the last
  // message makes up the difference; messages stay in one flat list so none of them
  // remounts (and reloads its card) when the next turn starts.
  const spaceLastTurn = followKey > 0 && lastUserIndex >= 0;
  const spacerRef = useRef<HTMLDivElement | null>(null);

  // Sized directly (not through state) so it is in place before the scroll above runs.
  useLayoutEffect(() => {
    const el = spacerRef.current;
    if (!el) return;
    if (!spaceLastTurn) {
      el.style.height = "0px";
      return;
    }
    const measure = () => {
      const question = lastUserRef.current;
      if (!question) return;
      // From the question's top to the end of the reply; the spacer tops it up to the
      // screen height less the room the header and message box take.
      const turn = el.getBoundingClientRect().top - question.getBoundingClientRect().top;
      el.style.height = `${Math.max(0, Math.round(window.innerHeight - TURN_ROOM - turn))}px`;
    };
    measure();
    const parent = el.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [spaceLastTurn, lastUserIndex]);

  // Scroll anchoring keeps the newest question still while the reply grows below it and
  // cards above it change. Everything else is opted out, so the browser can't anchor to
  // a part of the reply and jump the page as it arrives.
  const noAnchor = spaceLastTurn ? "[overflow-anchor:none]" : undefined;

  const renderMessage = (message: UiMessage, index: number) => {
    if (message.role === "user") {
      const text = message.parts[0]?.kind === "text" ? message.parts[0].text : "";
      const isLastUser = index === lastUserIndex;
      return (
        <div
          key={message.id}
          ref={isLastUser ? lastUserRef : undefined}
          className={cn("flex scroll-mt-24 justify-end", !isLastUser && noAnchor)}
        >
          <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-pine-deep px-4 py-2.5 text-[15.5px] leading-relaxed text-[#f5f2ea]">
            {text}
          </div>
        </div>
      );
    }
    const isLast = index === messages.length - 1;
    return (
      <AssistantMessage
        key={message.id}
        message={message}
        isLast={isLast}
        streaming={streaming && isLast}
        status={isLast ? status : null}
        activeSummary={activeSummary}
        className={noAnchor}
      />
    );
  };

  return (
    <div className="flex flex-col gap-comfortable" aria-live="polite" aria-busy={streaming}>
      <div className={cn("empty:hidden", noAnchor)}>{intro}</div>
      {messages.map(renderMessage)}
      {/* Cancels the list gap above it, so it adds nothing when it has no height. */}
      <div
        ref={spacerRef}
        aria-hidden="true"
        className="-mt-comfortable h-0 [overflow-anchor:none]"
        data-testid="turn-spacer"
      />
    </div>
  );
}

function AssistantMessage({
  message,
  isLast,
  streaming,
  status,
  activeSummary,
  className,
}: {
  message: UiMessage;
  isLast: boolean;
  streaming: boolean;
  status: string | null;
  activeSummary: string | null;
  className?: string;
}) {
  const showThinking = streaming && (message.parts.length === 0 || status);
  return (
    <div className={cn("flex flex-col gap-default", className)} data-testid="assistant-message">
      {suggestionsLast(message.parts).map(({ part, i }) => (
        <PartBoundary key={i} kind={part.kind}>
          <PartView
            part={part}
            active={activeSummary === `${message.id}:${i}`}
            interactive={isLast && !streaming}
          />
        </PartBoundary>
      ))}
      {showThinking && (
        <div className="flex items-center gap-2 text-body-sm text-text-tertiary" role="status">
          <span className="blink-dot inline-block h-2 w-2 rounded-full bg-sage" />
          {status ?? "Thinking"}
          {status ? "…" : ""}
        </div>
      )}
    </div>
  );
}

// Follow-up chips close a message even when the model wrote more text after them.
function suggestionsLast(parts: UiPart[]): { part: UiPart; i: number }[] {
  const indexed = parts.map((part, i) => ({ part, i }));
  return [
    ...indexed.filter(({ part }) => part.kind !== "suggestions"),
    ...indexed.filter(({ part }) => part.kind === "suggestions"),
  ];
}

function PartView({
  part,
  active,
  interactive,
}: {
  part: UiPart;
  active: boolean;
  interactive: boolean;
}) {
  switch (part.kind) {
    case "text":
      return (
        <div className="flex max-w-[680px] flex-col gap-3 text-[16px] leading-relaxed text-ink-soft">
          <Markdown text={part.text} />
        </div>
      );
    case "scenario_summary":
      return <ScenarioSummaryCard snapshot={part.draft} active={active} />;
    case "result_headline":
      return <ResultHeadlineCard resultId={part.result_id} />;
    case "bracket_fill":
      // Saved by earlier versions; the result card above already has this chart.
      return null;
    case "balance_comparison":
      return <BalanceComparisonCard resultId={part.result_id} />;
    case "scenario_compare":
      return (
        <ScenarioCompareCard
          resultId={part.result_id}
          baseResultId={part.base_result_id}
          label={part.label}
        />
      );
    case "mcp_app":
      return (
        <McpAppFrame
          resourceUri={part.resource_uri}
          toolName={part.tool_name}
          toolInput={part.tool_input}
          toolResult={part.tool_result}
        />
      );
    case "suggestions":
      return interactive ? <SuggestionChips suggestions={part.suggestions} /> : null;
    case "notice":
      return (
        <div
          role="alert"
          className="rounded-[14px] border border-border bg-paper-warm px-4 py-3 text-body-sm text-text-secondary"
        >
          {part.message}
        </div>
      );
  }
}
