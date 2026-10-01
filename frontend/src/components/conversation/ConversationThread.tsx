"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { UiMessage, UiPart } from "@/lib/agent/types";
import type { ConversationState } from "@/lib/agent/conversation";
import { Markdown } from "./Markdown";
import { ScenarioSummaryCard } from "./parts/ScenarioSummaryCard";
import {
  BalanceComparisonCard,
  BracketFillPart,
  ResultHeadlineCard,
  ScenarioCompareCard,
  SuggestionChips,
} from "./parts/ResultCards";

/** Index of the summary card that can still be edited and run, if any. */
function activeSummaryKey(messages: UiMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const kind = parts[j].kind;
      if (kind === "result_headline") return null;
      if (kind === "scenario_summary") return `${messages[i].id}:${j}`;
    }
  }
  return null;
}

export function ConversationThread({
  state,
  intro,
}: {
  state: ConversationState;
  /** Shown above the messages (the assistant's opening line). */
  intro?: ReactNode;
}) {
  const { messages, streaming, status } = state;
  const activeSummary = activeSummaryKey(messages);
  const lastUserRef = useRef<HTMLDivElement | null>(null);
  const userCount = messages.filter((m) => m.role === "user").length;
  const prevCount = useRef(userCount);

  // When the user sends a message, bring it to the top so the reply reads below it.
  useEffect(() => {
    if (userCount > prevCount.current && lastUserRef.current) {
      lastUserRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevCount.current = userCount;
  }, [userCount]);

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  return (
    <div className="flex flex-col gap-comfortable" aria-live="polite" aria-busy={streaming}>
      {intro}
      {messages.map((message, index) => {
        if (message.role === "user") {
          const text = message.parts[0]?.kind === "text" ? message.parts[0].text : "";
          return (
            <div
              key={message.id}
              ref={index === lastUserIndex ? lastUserRef : undefined}
              className="flex scroll-mt-24 justify-end"
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
          />
        );
      })}
    </div>
  );
}

function AssistantMessage({
  message,
  isLast,
  streaming,
  status,
  activeSummary,
}: {
  message: UiMessage;
  isLast: boolean;
  streaming: boolean;
  status: string | null;
  activeSummary: string | null;
}) {
  const showThinking = streaming && (message.parts.length === 0 || status);
  return (
    <div className="flex flex-col gap-default" data-testid="assistant-message">
      {message.parts.map((part, i) => (
        <PartView
          key={i}
          part={part}
          active={activeSummary === `${message.id}:${i}`}
          interactive={isLast && !streaming}
        />
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
      return <BracketFillPart resultId={part.result_id} />;
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
