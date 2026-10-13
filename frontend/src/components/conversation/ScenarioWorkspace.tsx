"use client";

/**
 * The scenario screen: a conversation (the default) or the form, both editing
 * one shared scenario draft, plus a full results view reachable from any result
 * in the conversation. Also powers /demo, where the conversation opens with a
 * replay of Margaret's example.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { InputForm } from "@/components/calculator/InputForm";
import { ResultsView } from "@/components/results/ResultsView";
import { MetricCardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/common/Skeleton";
import { Card } from "@/components/ui/card";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import { MethodologyLayout } from "@/components/methodology/MethodologyLayout";
import { apiClient } from "@/lib/api/client";
import { fetchDemoConversation } from "@/lib/agent/client";
import { loadConversation, latestResultId } from "@/lib/agent/conversation";
import type { AgentErrorCode, DemoConversation } from "@/lib/agent/types";
import type { OptimizationResult, ScenarioInput } from "@/lib/types";
import {
  EMPTY_DRAFT,
  applyDraftPatch,
  hasDraftValues,
  normalizeDraft,
  type DraftPatch,
  type ScenarioDraft,
} from "@/lib/scenario/draft";
import { CURRENT_YEAR } from "@/lib/utils/constants";
import { useConversation } from "@/hooks/useConversation";
import { useSaveScenario } from "@/hooks/useSaveScenario";
import { useAccount } from "@/lib/auth/account";
import { SavedScenarioError, savedScenarios } from "@/lib/api/savedScenarios";
import { SaveScenarioButton } from "@/components/saved/SaveScenarioButton";
import { usePrefersReducedMotion } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { ConversationContext, type ConversationContextValue } from "./ConversationContext";
import { ConversationThread } from "./ConversationThread";
import { Composer } from "./Composer";
import { FullResultsView } from "./FullResultsView";
import { Markdown } from "./Markdown";
import { ModeToggle, type WorkspaceMode } from "./ModeToggle";

type Variant = "calculator" | "demo";

const KEYS = {
  calculator: {
    conversation: "lucerna:conversation:v1",
    draft: "lucerna:draft:v1",
  },
  demo: {
    conversation: "lucerna:demo-conversation:v1",
    draft: "lucerna:demo-draft:v1",
  },
} as const;

const MODE_KEY = "lucerna:mode";

function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable; state lives for this page view.
  }
}

const FALLBACK_NOTICE: Record<string, string> = {
  conversation_limit:
    "This conversation reached its message limit. Everything you told the assistant is filled in below.",
  daily_limit:
    "You've reached today's limit for the assistant. Everything you told it is filled in below.",
  default:
    "The assistant is unavailable right now. Everything you told it is filled in below, so you can keep going with the form.",
};

export function ScenarioWorkspace({ variant }: { variant: Variant }) {
  const keys = KEYS[variant];
  const isDemo = variant === "demo";
  const reducedMotion = usePrefersReducedMotion();

  // ------------------------------------------------------------------ draft
  const [draft, setDraft] = useState<ScenarioDraft>(EMPTY_DRAFT);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const saved = readSession<Partial<ScenarioDraft>>(keys.draft);
    if (saved) setDraft(normalizeDraft(saved));
  }, [keys.draft]);

  const updateDraft = useCallback(
    (next: ScenarioDraft) => {
      draftRef.current = next;
      setDraft(next);
      writeSession(keys.draft, next);
    },
    [keys.draft]
  );

  const editDraft = useCallback(
    (patch: DraftPatch) => updateDraft(applyDraftPatch(draftRef.current, patch, CURRENT_YEAR)),
    [updateDraft]
  );

  // ------------------------------------------------------------------- mode
  const [mode, setMode] = useState<WorkspaceMode>("conversation");
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MODE_KEY);
    } catch {
      // Ignore.
    }
    const initial: WorkspaceMode = stored === "form" ? "form" : "conversation";
    setMode(initial);
    posthog.capture("mode_shown", { mode: initial });
  }, [isDemo]);

  const changeMode = useCallback((next: WorkspaceMode) => {
    setMode(next);
    posthog.capture("mode_switched", { mode: next });
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Ignore.
    }
  }, []);

  const handleFallback = useCallback(
    (code: AgentErrorCode) => {
      posthog.capture("agent_fallback_to_form", { code, surface: variant });
      if (isDemo) return; // the demo shows the notice and links to the calculator
      setFallbackNotice(FALLBACK_NOTICE[code] ?? FALLBACK_NOTICE.default);
      setMode("form");
    },
    [isDemo, variant]
  );

  // ----------------------------------------------------------- conversation
  const conversation = useConversation({
    storageKey: keys.conversation,
    getDraft: () => draftRef.current,
    onDraft: updateDraft,
    onFallback: handleFallback,
    surface: variant,
  });
  const { state, send, replay, reset, loadResult, addResult } = conversation;

  // Demo: replay Margaret's conversation unless this tab already has one.
  const [demo, setDemo] = useState<DemoConversation | null>(null);
  const [demoError, setDemoError] = useState(false);
  const replayStarted = useRef(false);

  const startDemo = useCallback(
    async (animate: boolean) => {
      try {
        const data = demo ?? (await fetchDemoConversation());
        setDemo(data);
        updateDraft(normalizeDraft(data.draft));
        posthog.capture("demo_conversation_started", { source: data.source });
        await replay(data, { animate });
      } catch {
        setDemoError(true);
      }
    },
    [demo, replay, updateDraft]
  );

  useEffect(() => {
    if (!isDemo || replayStarted.current) return;
    replayStarted.current = true;
    if (loadConversation(keys.conversation)) return;
    void startDemo(!reducedMotion);
  }, [isDemo, keys.conversation, reducedMotion, startDemo]);

  // Results dropped from session storage are recomputed from their inputs.
  const recomputing = useRef(new Set<string>());
  const ensureResult = useCallback(
    (id: string) => {
      const stored = state.results[id];
      if (!stored || stored.result || recomputing.current.has(id)) return;
      recomputing.current.add(id);
      apiClient
        .optimize(stored.input as unknown as Record<string, unknown>)
        .then((result) => loadResult(id, result as OptimizationResult))
        .catch(() => recomputing.current.delete(id));
    },
    [state.results, loadResult]
  );

  // --------------------------------------------------------- results view
  const [resultsView, setResultsView] = useState<string | null>(null);
  const scrollBeforeResults = useRef(0);
  // After "Ask about this", land on the new question instead of the old position.
  const scrollToEndOnReturn = useRef(false);

  const openResults = useCallback((id: string) => {
    scrollBeforeResults.current = window.scrollY;
    window.history.pushState({ lucernaResults: id }, "", `?view=results&result=${id}`);
    setResultsView(id);
    window.scrollTo({ top: 0 });
  }, []);

  const closeResults = useCallback(() => {
    if (window.history.state?.lucernaResults) {
      window.history.back(); // popstate restores the conversation
    } else {
      setResultsView(null);
    }
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const id = (e.state as { lucernaResults?: string } | null)?.lucernaResults ?? null;
      setResultsView(id);
      if (id) return;
      requestAnimationFrame(() => {
        const top = scrollToEndOnReturn.current
          ? document.documentElement.scrollHeight
          : scrollBeforeResults.current;
        scrollToEndOnReturn.current = false;
        window.scrollTo({ top });
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A reload on the results view reopens it once the conversation is restored.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("result");
    if (params.get("view") !== "results" || !id) return;
    if (state.results[id]) {
      window.history.replaceState({ lucernaResults: id }, "", window.location.href);
      setResultsView(id);
    }
  }, [state.results]);

  // A full results link from another app (an MCP App View in ChatGPT or Claude, or a
  // shared link) carries its scenario: rebuild and run it, then open its results.
  const [linkStatus, setLinkStatus] = useState<"idle" | "loading" | "error">("idle");
  const linkOpened = useRef(false);
  useEffect(() => {
    if (isDemo || linkOpened.current) return;
    const params = new URLSearchParams(window.location.search);
    const scenario = params.get("scenario");
    if (params.get("view") !== "results" || !scenario) return;
    linkOpened.current = true;
    const known = params.get("result");
    if (known && loadConversation(keys.conversation)?.results[known]) return; // reload
    setLinkStatus("loading");
    apiClient
      .openScenarioLink(scenario, params.get("label"))
      .then((opened) => {
        updateDraft(normalizeDraft(opened.draft));
        addResult(opened);
        posthog.capture("full_results_link_opened");
        // The conversation goes underneath, so "Back to conversation" stays on the site
        // even in a fresh tab. The results entry keeps the scenario in its address so
        // the link can still be shared.
        const url = new URL(window.location.href);
        url.searchParams.set("result", opened.result_id);
        window.history.replaceState(null, "", window.location.pathname);
        window.history.pushState({ lucernaResults: opened.result_id }, "", url.toString());
        setResultsView(opened.result_id);
        setLinkStatus("idle");
      })
      .catch(() => setLinkStatus("error"));
  }, [isDemo, keys.conversation, updateDraft, addResult]);

  // ------------------------------------------------------ saved scenarios
  const account = useAccount();
  const { status: saveStatus, save: saveScenario } = useSaveScenario(draft, variant);

  // /calculator?saved=<id> (from "My scenarios") fills in a saved scenario's values.
  const [savedNotice, setSavedNotice] = useState<{ text: string; signIn?: boolean } | null>(null);
  const savedOpened = useRef(false);
  useEffect(() => {
    if (isDemo || savedOpened.current || !account.loaded) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("saved");
    if (!id) return;
    if (account.enabled && !account.signedIn) {
      setSavedNotice({ text: "Sign in to open your saved scenario.", signIn: true });
      return; // signing in reloads this page with the same address
    }
    savedOpened.current = true;
    params.delete("saved");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    savedScenarios
      .get(id)
      .then((opened) => {
        updateDraft(normalizeDraft(opened.draft));
        setSavedNotice({
          text: `Opened “${opened.name}”. Check the values, then run it or ask about it.`,
        });
        posthog.capture("saved_scenario_opened");
      })
      .catch((err) =>
        setSavedNotice({
          text:
            err instanceof SavedScenarioError && err.code === "not_found"
              ? "That saved scenario wasn't found."
              : "That saved scenario couldn't be opened. Try again from My scenarios.",
        })
      );
  }, [isDemo, account.loaded, account.enabled, account.signedIn, updateDraft]);

  const applyWhatIf = useCallback(
    (id: string) => {
      const variantDraft = state.results[id]?.draft;
      if (!variantDraft) return;
      updateDraft(normalizeDraft(variantDraft));
      posthog.capture("what_if_applied");
    },
    [state.results, updateDraft]
  );

  // ------------------------------------------------------- "Ask about this"
  const askAbout = useCallback(
    (question: string) => {
      if (resultsView) {
        scrollToEndOnReturn.current = true;
        closeResults();
      }
      if (mode !== "conversation") changeMode("conversation");
      posthog.capture("ask_about_this");
      void send(question);
    },
    [resultsView, closeResults, mode, changeMode, send]
  );

  // -------------------------------------------------------------- form flow
  const [formResult, setFormResult] = useState<OptimizationResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const formResultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formLoading && formResultsRef.current) {
      formResultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [formLoading]);

  async function handleFormSubmit(input: ScenarioInput) {
    setFormLoading(true);
    setFormError(null);
    setFormResult(null);
    posthog.capture("scenario_submitted", {
      filing_status: input.filing_status,
      num_years: input.timeline?.length ?? 1,
      has_life_events: input.timeline?.some((y) => y.notes && y.notes.trim() !== "") ?? false,
    });
    try {
      const data = await apiClient.optimize(input as unknown as Record<string, unknown>);
      setFormResult(data as OptimizationResult);
      posthog.capture("scenario_completed");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setFormLoading(false);
    }
  }

  // ------------------------------------------------------------- rendering
  const contextValue: ConversationContextValue = useMemo(
    () => ({
      results: state.results,
      draft,
      streaming: state.streaming,
      send: (text: string) => void send(text),
      editDraft,
      openResults,
      applyWhatIf: isDemo ? undefined : applyWhatIf,
      openForm: isDemo ? undefined : () => changeMode("form"),
      ensureResult,
      saveScenario: isDemo ? undefined : saveScenario,
    }),
    [
      state.results,
      state.streaming,
      draft,
      send,
      editDraft,
      openResults,
      isDemo,
      applyWhatIf,
      changeMode,
      ensureResult,
      saveScenario,
    ]
  );

  // The opening line reflects whether the form had values when the conversation began.
  const [introHasDraft, setIntroHasDraft] = useState(false);
  const draftHasValues = hasDraftValues(draft);
  const conversationEmpty = state.messages.length === 0;
  useEffect(() => {
    if (conversationEmpty) setIntroHasDraft(draftHasValues);
  }, [conversationEmpty, draftHasValues]);

  const openStored = resultsView ? state.results[resultsView] : undefined;
  const sidebarResult =
    (openStored?.result ?? undefined) ||
    (mode === "form" ? (formResult ?? undefined) : undefined) ||
    (() => {
      const id = latestResultId(state);
      return id ? (state.results[id]?.result ?? undefined) : undefined;
    })();

  const conversationLive = isDemo || mode === "conversation";
  const replayDone = !isDemo || state.apiMessages.length > 0;

  const canSave = !isDemo && account.enabled && draftHasValues;
  const savedNoticeView = savedNotice && (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-paper-warm px-4 py-3 text-body-sm text-text-secondary"
    >
      <span>{savedNotice.text}</span>
      {savedNotice.signIn && (
        <button
          type="button"
          onClick={account.openSignIn}
          className="font-medium text-pine underline decoration-border underline-offset-4 hover:decoration-pine"
        >
          Sign in
        </button>
      )}
    </div>
  );

  let body: ReactNode;
  if (linkStatus === "loading") {
    body = (
      <div className="card animate-pulse text-body-sm text-text-tertiary" role="status">
        Opening your results…
      </div>
    );
  } else if (openStored) {
    body = (
      <FullResultsView
        stored={openStored}
        onBack={closeResults}
        onApply={isDemo ? undefined : () => applyWhatIf(resultsView!)}
      />
    );
  } else if (conversationLive) {
    body = (
      <>
        {savedNoticeView}
        {linkStatus === "error" && (
          <div
            role="alert"
            className="rounded-[14px] border border-border bg-paper-warm px-4 py-3 text-body-sm text-text-secondary"
          >
            That results link couldn&apos;t be opened. Describe your situation below to run it
            again.
          </div>
        )}
        <ConversationThread
          state={state}
          intro={
            isDemo ? (
              <DemoIntro error={demoError} onRetry={() => void startDemo(false)} />
            ) : (
              <AssistantIntro
                hasDraft={introHasDraft}
                empty={state.messages.length === 0}
                onStart={(text) => void send(text)}
              />
            )
          }
        />
        {isDemo && replayDone && state.messages.length > 0 && !state.streaming && (
          <DemoCta
            onRestart={() => {
              reset();
              void startDemo(!reducedMotion);
            }}
          />
        )}
        {!isDemo && !state.streaming && (state.messages.length > 0 || canSave) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {canSave && <SaveScenarioButton status={saveStatus} onSave={saveScenario} />}
            {state.messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  posthog.capture("conversation_reset");
                }}
                className="text-body-sm text-text-tertiary underline decoration-border underline-offset-4 hover:text-text-primary"
              >
                Start over
              </button>
            )}
          </div>
        )}
        <Composer
          onSend={(text) => void send(text)}
          disabled={state.streaming || (isDemo && !replayDone)}
          placeholder={
            isDemo
              ? "Ask a follow-up about Margaret's results"
              : state.messages.length === 0
                ? "Describe your situation in a sentence or two"
                : undefined
          }
        />
      </>
    );
  } else {
    body = (
      <>
        {savedNoticeView}
        {fallbackNotice && (
          <div
            role="status"
            className="rounded-[14px] border border-border bg-paper-warm px-4 py-3 text-body-sm text-text-secondary"
          >
            {fallbackNotice}
          </div>
        )}
        <InputForm
          onSubmit={handleFormSubmit}
          loading={formLoading}
          loadingLabel="Running..."
          draft={draft}
          onDraftChange={updateDraft}
        />
        <div ref={formResultsRef} className="scroll-mt-24">
          {formLoading && (
            <div className="flex flex-col gap-section">
              <div className="grid grid-cols-2 gap-default sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <MetricCardSkeleton key={i} />
                ))}
              </div>
              <ChartSkeleton />
              <TableSkeleton rows={3} />
            </div>
          )}
          {formError && (
            <Card className="border-negative">
              <p className="text-body text-negative">{formError}</p>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="mt-default text-body-sm font-medium text-accent transition-colors duration-300 hover:text-accent-hover"
              >
                Try again
              </button>
            </Card>
          )}
          {formResult && <ResultsView result={formResult} />}
        </div>
        {canSave && !formLoading && (
          <SaveScenarioButton status={saveStatus} onSave={saveScenario} />
        )}
      </>
    );
  }

  return (
    <MethodologyProvider askAbout={askAbout}>
      <Header />
      <MethodologyLayout result={sidebarResult}>
        <main className="px-default py-section-lg md:px-page">
          <div
            className={cn(
              "mx-auto flex flex-col gap-section",
              conversationLive && !openStored ? "max-w-[760px]" : "max-w-content"
            )}
          >
            {!openStored && (
              <PageIntro
                isDemo={isDemo}
                mode={mode}
                onModeChange={(next) => {
                  setFallbackNotice(null);
                  changeMode(next);
                  window.scrollTo({ top: 0 });
                }}
              />
            )}
            <ConversationContext.Provider value={contextValue}>{body}</ConversationContext.Provider>
          </div>
        </main>
        <PageFooter />
      </MethodologyLayout>
    </MethodologyProvider>
  );
}

// ---------------------------------------------------------------------------

function PageIntro({
  isDemo,
  mode,
  onModeChange,
}: {
  isDemo: boolean;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}) {
  if (isDemo) {
    return (
      <div className="flex flex-col gap-3">
        <span className="eyebrow-pine block">Example conversation</span>
        <h1 className="display-heading text-display">
          Meet Margaret. <em>Her window is open.</em>
        </h1>
        <p className="max-w-[620px] text-body leading-relaxed text-text-secondary">
          Margaret, 63, retired from nursing last year with $1.4 million in her 401(k). Here&apos;s
          how she talked it through. Ask your own follow-up questions about her results below.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-default">
      <div className="flex flex-col gap-3">
        <span className="eyebrow-pine block">Your scenario</span>
        <h1 className="display-heading text-display">
          Run <em>your numbers.</em>
        </h1>
        <p className="max-w-[620px] text-body leading-relaxed text-text-secondary">
          {mode === "conversation"
            ? "Talk through your situation and the optimizer will find the Roth conversion schedule that maximizes your after-tax wealth."
            : "Enter your details and the optimizer will find the Roth conversion schedule that maximizes your after-tax wealth."}
        </p>
      </div>
      <ModeToggle mode={mode} onChange={onModeChange} />
    </div>
  );
}

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-[680px] flex-col gap-3 text-[16px] leading-relaxed text-ink-soft">
      {children}
    </div>
  );
}

function AssistantIntro({
  hasDraft,
  empty,
  onStart,
}: {
  hasDraft: boolean;
  empty: boolean;
  onStart: (text: string) => void;
}) {
  const starters = hasDraft
    ? ["Run my scenario", "Explain what I've entered so far"]
    : [
        "I just left my job to start a company",
        "I'm planning to retire early",
        "How do Roth conversions work?",
      ];
  return (
    <div className="flex flex-col gap-default">
      <AssistantBubble>
        <Markdown
          text={
            hasDraft
              ? "I can see the scenario you started in the form. Tell me what's different, or ask me to run it."
              : "Let's map out your situation. Tell me your age, whether you file single or jointly, your income this year, your traditional IRA or 401(k) balance, and when you plan to start drawing on it. A sentence or two is plenty."
          }
        />
      </AssistantBubble>
      {empty && (
        <div className="flex flex-wrap gap-2">
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                posthog.capture("starter_tapped", { starter: s });
                onStart(s);
              }}
              className="min-h-[40px] rounded-full border border-border bg-white px-4 py-2 text-left text-[14.5px] font-medium text-text-primary transition-colors duration-200 hover:border-pine-mid hover:text-pine"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DemoIntro({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  if (!error) return null;
  return (
    <Card className="border-negative">
      <p className="text-body text-negative">We couldn&apos;t load the example conversation.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-default text-body-sm font-medium text-accent hover:text-accent-hover"
      >
        Try again
      </button>
    </Card>
  );
}

function DemoCta({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="dark-wash relative flex flex-col gap-default overflow-hidden rounded-[26px] bg-pine-deep p-comfortable sm:flex-row sm:items-center sm:justify-between sm:p-section">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[24px] font-semibold leading-tight text-white">
          Ready to try yours?
        </h2>
        <p className="text-body-sm text-pine-haze">
          Tell the assistant about your situation and see your own schedule.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/calculator"
          className="btn-paper"
          onClick={() =>
            posthog.capture("cta_clicked", { cta: "try_yours", source: "demo_conversation" })
          }
        >
          Talk through your numbers
        </Link>
        <button type="button" className="btn-outline-paper" onClick={onRestart}>
          Replay example
        </button>
      </div>
    </div>
  );
}
