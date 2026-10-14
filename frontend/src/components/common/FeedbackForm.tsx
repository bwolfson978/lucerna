"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/common/FormField";
import { cn } from "@/lib/utils";

export type FeedbackKind = "feedback" | "problem";

export interface FeedbackSubmission {
  kind: FeedbackKind;
  message: string;
  expected?: string;
  email?: string;
}

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "feedback", label: "Share feedback" },
  { value: "problem", label: "Report a problem" },
];

const COPY: Record<FeedbackKind, { label: string; placeholder: string }> = {
  feedback: {
    label: "What's on your mind?",
    placeholder: "An idea, a question, or what worked well for you",
  },
  problem: {
    label: "What went wrong?",
    placeholder: "What you were doing and what you saw",
  },
};

const MAX_MESSAGE = 2000;

const textareaClass = cn(
  "w-full rounded-[10px] border border-border bg-white px-3 py-2.5",
  "text-body text-text-primary placeholder:text-text-tertiary",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-pine-mid/15",
  "transition-all duration-300"
);

/**
 * Feedback and problem-report form. Sends through `onSubmit` (the page wires it to
 * POST /api/feedback, which files it in PostHog Surveys) and thanks the user when done.
 */
export function FeedbackForm({
  initialKind = "feedback",
  onSubmit,
}: {
  initialKind?: FeedbackKind;
  onSubmit: (submission: FeedbackSubmission) => Promise<void>;
}) {
  const [kind, setKind] = React.useState<FeedbackKind>(initialKind);
  const [message, setMessage] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const copy = COPY[kind];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) {
      setError("Please write a few words first.");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      await onSubmit({
        kind,
        message: message.trim(),
        expected: kind === "problem" && expected.trim() ? expected.trim() : undefined,
        email: email.trim() || undefined,
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error && err.message ? err.message : "That didn't send.");
    }
  }

  if (status === "sent") {
    return (
      <div className="card flex flex-col gap-3" role="status">
        <h2 className="text-h3 font-semibold text-text-primary">Thanks, it&apos;s been sent.</h2>
        <p className="text-body-sm text-text-secondary">
          {email.trim()
            ? "The developer reads every message and will reply by email if there's a question."
            : "The developer reads every message. Leave an email next time if you'd like a reply."}
        </p>
        <button
          type="button"
          className="btn-ghost self-start"
          onClick={() => {
            setMessage("");
            setExpected("");
            setStatus("idle");
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form className="card flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <div
        role="radiogroup"
        aria-label="What would you like to send?"
        className="inline-flex w-full rounded-full border border-border bg-paper-warm p-1 sm:w-auto sm:self-start"
      >
        {KINDS.map((option) => {
          const selected = option.value === kind;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(option.value)}
              className={cn(
                "min-h-[40px] flex-1 whitespace-nowrap rounded-full px-3 text-[14.5px] font-semibold transition-all duration-200 sm:flex-none sm:px-5",
                selected
                  ? "bg-pine-deep text-[#f5f2ea] shadow-[0_8px_20px_-12px_rgba(11,29,21,0.6)]"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-message">{copy.label}</Label>
        <textarea
          id="feedback-message"
          rows={5}
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={copy.placeholder}
          className={cn(textareaClass, error && !message.trim() && "border-negative")}
        />
      </div>

      {kind === "problem" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-expected">What did you expect to happen? (optional)</Label>
          <textarea
            id="feedback-expected"
            rows={2}
            maxLength={MAX_MESSAGE}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className={textareaClass}
          />
        </div>
      )}

      <FormField
        id="feedback-email"
        label="Email (optional)"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        helper="Only if you'd like a reply."
      />

      {error && (
        <p className="text-body-sm text-negative" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn-dark self-start" disabled={status === "sending"}>
        {status === "sending" ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
