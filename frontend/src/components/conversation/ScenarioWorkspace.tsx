"use client";

/**
 * The scenario screen: a conversation beside the scenario it builds. The assistant and
 * the person edit one shared scenario draft, which lives in a panel on the right (a
 * sheet on phones) with the Run button. The panel folds away to a thin strip, leaving
 * the conversation centered, and a bar above the message box opens it again. Any result
 * in the conversation opens a full results view, and the panel opens a full details
 * view for the rest of the inputs. Also powers /demo, where the conversation opens with
 * a replay of Margaret's example.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { RUN_MESSAGE } from "@lucerna/ui";
import { AUTH_ENABLED, SignInButton, useAuth, useUser } from "@/lib/auth";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { Card } from "@/components/ui/card";
import { GlowButton } from "@/components/common/GlowButton";
import { SaveResultsBanner, type SaveBannerState } from "@/components/common/SaveResultsBanner";
import { SignInRequired } from "@/components/common/SignInRequired";
import {
  MethodologyProvider,
  useMethodologyOptional,
} from "@/components/methodology/MethodologyContext";
import { MethodologyLayout } from "@/components/methodology/MethodologyLayout";
import { apiClient } from "@/lib/api/client";
import { ScenariosApiError, createScenariosApi } from "@/lib/api/scenarios";
import { fetchDemoConversation } from "@/lib/agent/client";
import { loadConversation, latestResultId } from "@/lib/agent/conversation";
import type { AgentErrorCode, AgentEvent, DemoConversation } from "@/lib/agent/types";
import type { OptimizationResult, ScenarioInput } from "@/lib/types";
import {
  EMPTY_DRAFT,
  applyDraftPatch,
  buildScenarioInput,
  hasDraftValues,
  isDraftReady,
  normalizeDraft,
  type DraftPatch,
  type ScenarioDraft,
} from "@/lib/scenario/draft";
import { changeSummary, changedFields, detailCount, draftKey } from "@/lib/scenario/changes";
import { CURRENT_YEAR } from "@/lib/utils/constants";
import { useConversation } from "@/hooks/useConversation";
import { usePrefersReducedMotion } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { ConversationContext, type ConversationContextValue } from "./ConversationContext";
import { ConversationThread } from "./ConversationThread";
import { Composer } from "./Composer";
import { FullResultsView } from "./FullResultsView";
import { Markdown } from "./Markdown";
import { ScenarioDetailsView } from "./ScenarioDetailsView";
import {
  ScenarioBar,
  ScenarioPanel,
  ScenarioSheet,
  scenarioStatus,
  type DetailsSection,
  type ScenarioPanelProps,
  type ScenarioStatus,
} from "./ScenarioPanel";

type Variant = "calculator" | "demo";

const KEYS = {
  calculator: {
    conversation: "lucerna:conversation:v1",
    draft: "lucerna:draft:v1",
    ran: "lucerna:draft-ran:v1",
    unsaved: "lucerna:unsaved-runs:v1",
    saved: "lucerna:saved-scenario:v1",
  },
  demo: {
    conversation: "lucerna:demo-conversation:v1",
    draft: "lucerna:demo-draft:v1",
    ran: "lucerna:demo-draft-ran:v1",
    unsaved: "lucerna:demo-unsaved-runs:v1",
    saved: "lucerna:demo-saved-scenario:v1",
  },
} as const;

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

function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage unavailable.
  }
}

// Whether the visitor last left the desktop scenario panel open or folded away.
const PANEL_KEY = "lucerna:scenario-panel:v1";

function readPanelChoice(): boolean | null {
  try {
    const value = localStorage.getItem(PANEL_KEY);
    return value === "open" ? true : value === "closed" ? false : null;
  } catch {
    return null;
  }
}

function writePanelChoice(open: boolean): void {
  try {
    localStorage.setItem(PANEL_KEY, open ? "open" : "closed");
  } catch {
    // Storage unavailable; the choice lasts for this page view.
  }
}

const isDesktop = () => window.matchMedia?.("(min-width: 1024px)").matches ?? false;

/** What fills the page beside the scenario panel. */
type View =
  | { kind: "conversation" }
  | { kind: "results"; id: string }
  | { kind: "details"; section?: DetailsSection };

const CONVERSATION: View = { kind: "conversation" };

/** The view a history entry holds. Views are history entries so Back returns to the chat. */
function viewFromHistory(state: unknown): View {
  const s = state as { lucernaResults?: string; lucernaDetails?: string } | null;
  if (s?.lucernaResults) return { kind: "results", id: s.lucernaResults };
  if (s?.lucernaDetails) {
    const section = s.lucernaDetails as DetailsSection | "all";
    return { kind: "details", section: section === "all" ? undefined : section };
  }
  return CONVERSATION;
}

function historyEntry(view: View): { state: object; url: string } {
  if (view.kind === "results") {
    return { state: { lucernaResults: view.id }, url: `?view=results&result=${view.id}` };
  }
  if (view.kind === "details") {
    return {
      state: { lucernaDetails: view.section ?? "all" },
      url: `?view=details${view.section ? `&section=${view.section}` : ""}`,
    };
  }
  return { state: {}, url: window.location.pathname };
}

const isViewEntry = (state: unknown) => viewFromHistory(state).kind !== "conversation";

const DEMO_STATUS: ScenarioStatus = { tone: "done", text: "From the example, read only" };

// The conversation column and the message box share one width.
const CHAT_WIDTH = "max-w-[720px]";

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

  // The draft as it was when it was last run, to say whether the results are current.
  const [ranKey, setRanKey] = useState<string | null>(null);

  useEffect(() => {
    const saved = readSession<Partial<ScenarioDraft>>(keys.draft);
    if (saved) setDraft(normalizeDraft(saved));
    setRanKey(readSession<string>(keys.ran));
  }, [keys.draft, keys.ran]);

  const markRan = useCallback(
    (ran: ScenarioDraft) => {
      const key = draftKey(ran);
      setRanKey(key);
      writeSession(keys.ran, key);
    },
    [keys.ran]
  );

  const updateDraft = useCallback(
    (next: ScenarioDraft) => {
      draftRef.current = next;
      setDraft(next);
      writeSession(keys.draft, next);
    },
    [keys.draft]
  );

  // The desktop panel: open, or folded to its strip. The visitor's own choice is kept on
  // this device; until they make one, it starts closed (open when there's already a
  // scenario) and opens the first time the assistant fills the scenario in.
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelAnimate, setPanelAnimate] = useState(false);
  const panelChosen = useRef(false);

  useEffect(() => {
    const choice = readPanelChoice();
    panelChosen.current = choice != null;
    const saved = readSession<Partial<ScenarioDraft>>(keys.draft);
    setPanelOpen(choice ?? (isDemo || (saved != null && hasDraftValues(normalizeDraft(saved)))));
  }, [isDemo, keys.draft]);

  const choosePanel = useCallback((open: boolean) => {
    panelChosen.current = true;
    writePanelChoice(open);
    setPanelAnimate(true);
    setPanelOpen(open);
  }, []);

  // Values the assistant (or an applied what-if) just filled in, marked "New" in the panel
  // and counted on the bar until the person changes them or sends another message.
  const [highlight, setHighlight] = useState<ReturnType<typeof changedFields>>([]);
  // The same update in words, for screen readers.
  const [announcement, setAnnouncement] = useState("");

  const replaceDraft = useCallback(
    (next: ScenarioDraft) => {
      const normalized = normalizeDraft(next);
      const changed = changedFields(draftRef.current, normalized);
      setHighlight(changed);
      if (changed.length > 0) {
        setAnnouncement(changeSummary(draftRef.current, normalized));
        if (!panelChosen.current) {
          setPanelAnimate(true);
          setPanelOpen(true);
        }
      }
      updateDraft(normalized);
    },
    [updateDraft]
  );

  const editDraft = useCallback(
    (patch: DraftPatch) => {
      const next = applyDraftPatch(draftRef.current, patch, CURRENT_YEAR);
      const changed = changedFields(draftRef.current, next);
      setHighlight((h) => h.filter((f) => !changed.includes(f)));
      updateDraft(next);
    },
    [updateDraft]
  );

  const changeDraftInForm = useCallback(
    (next: ScenarioDraft) => {
      const changed = changedFields(draftRef.current, next);
      setHighlight((h) => h.filter((f) => !changed.includes(f)));
      updateDraft(next);
    },
    [updateDraft]
  );

  // The assistant can't continue (a limit or an outage): runs go straight to the engine.
  const assistantDown = useRef<AgentErrorCode | null>(null);
  const handleFallback = useCallback(
    (code: AgentErrorCode) => {
      posthog.capture("agent_fallback_to_form", { code, surface: variant });
      assistantDown.current = code;
    },
    [variant]
  );

  // Signed-in runs of the person's own scenario are saved to "My scenarios". A scenario
  // keeps one saved copy: the first run creates it, and later runs, edited or not,
  // overwrite it (keys.saved holds its id for this tab). Only an explicit start (Start
  // over, or New scenario on My scenarios) begins a new one. Signed-out, the latest run
  // is remembered for this tab and saved as soon as the person signs in or creates an
  // account, from the header or the save banner.
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [saveStates, setSaveStates] = useState<Record<string, SaveBannerState>>({});
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Saves run one at a time, so a second run can't create a copy while the first
  // save is still waiting for its id.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  // What each failed save needs to be tried again from the banner.
  const failedSaves = useRef<Record<string, [ScenarioInput, OptimizationResult, ScenarioDraft]>>(
    {}
  );

  const saveResult = useCallback(
    (id: string, input: ScenarioInput, result: OptimizationResult, draft: ScenarioDraft) => {
      if (!AUTH_ENABLED || isDemo) return;
      if (!isSignedIn) {
        writeSession(keys.unsaved, [id]);
        return;
      }
      setBannerDismissed(false);
      setSaveStates((s) => ({ ...s, [id]: "saving" }));
      delete failedSaves.current[id];
      const api = createScenariosApi(getToken);
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const savedId = readSession<string>(keys.saved);
          const updated = savedId
            ? await api.update(savedId, input, result, draft).catch((err: unknown) => {
                // Deleted since (here or in a chat): save it again as new.
                if (err instanceof ScenariosApiError && err.status === 404) return null;
                throw err;
              })
            : null;
          if (!updated) writeSession(keys.saved, (await api.save(input, result, draft)).id);
          setSaveStates((s) => ({ ...s, [id]: "saved" }));
        } catch {
          failedSaves.current[id] = [input, result, draft];
          setSaveStates((s) => ({ ...s, [id]: "failed" }));
        }
      });
    },
    [isDemo, isSignedIn, getToken, keys.unsaved, keys.saved]
  );

  /** Begin a new scenario: later runs save a new copy instead of overwriting. */
  const startNewScenario = useCallback(() => {
    removeSession(keys.saved);
    removeSession(keys.unsaved);
  }, [keys.saved, keys.unsaved]);

  // A run from the Run button is waiting for the assistant's result.
  const pendingRun = useRef(false);

  const handleResult = useCallback(
    (event: Extract<AgentEvent, { type: "result" }>) => {
      if (event.draft) return; // a what-if, not the scenario itself
      // The assistant records the scenario before running it, so this is what ran.
      markRan(draftRef.current);
      if (pendingRun.current) {
        pendingRun.current = false;
        posthog.capture("scenario_completed", { via: "assistant" });
        saveResult(event.result_id, event.result.input, event.result, draftRef.current);
      }
    },
    [markRan, saveResult]
  );

  // ----------------------------------------------------------- conversation
  const conversation = useConversation({
    storageKey: keys.conversation,
    getDraft: () => draftRef.current,
    onDraft: replaceDraft,
    onFallback: handleFallback,
    onResult: handleResult,
    surface: variant,
  });
  const { state, send: sendMessage, replay, reset, loadResult, addResult } = conversation;

  // "New scenario" (?new=1) starts from a blank form and a new saved copy, even in a tab
  // that was working on another one.
  useEffect(() => {
    if (isDemo) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("new")) return;
    reset();
    startNewScenario();
    removeSession(keys.ran);
    setRanKey(null);
    updateDraft(EMPTY_DRAFT);
    url.searchParams.delete("new");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [isDemo, reset, startNewScenario, keys.ran, updateDraft]);

  // Everything the person sends from this page goes through here, so the thread can
  // bring their message to the top (a demo replay adds messages without it).
  const [followKey, setFollowKey] = useState(0);
  const send = useCallback(
    (text: string) => {
      setFollowKey((k) => k + 1);
      setHighlight([]);
      return sendMessage(text);
    },
    [sendMessage]
  );

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

  // Once signed in, save the runs made before. Session storage carries them across the
  // page reload a Google sign-in brings; an id whose result isn't restored yet waits. A
  // result too big to keep in storage comes back empty: it is recomputed from its input
  // and saved once it arrives.
  useEffect(() => {
    if (!isSignedIn) return;
    const unsaved = readSession<string[]>(keys.unsaved);
    if (!unsaved?.length) return;
    const waiting = unsaved.filter((id) => {
      const stored = state.results[id];
      if (!stored) return true;
      if (!stored.result) {
        ensureResult(id);
        return true;
      }
      saveResult(id, stored.result.input, stored.result, draftRef.current);
      return false;
    });
    if (waiting.length !== unsaved.length) writeSession(keys.unsaved, waiting);
  }, [isSignedIn, state.results, keys.unsaved, saveResult, ensureResult]);

  // ------------------------------------------------------------------ views
  const [view, setView] = useState<View>(CONVERSATION);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const scrollBeforeView = useRef(0);
  // After "Ask about this" or a run, land on the newest message instead of the old position.
  const scrollToEndOnReturn = useRef(false);

  const openView = useCallback((next: View) => {
    if (viewRef.current.kind === "conversation") scrollBeforeView.current = window.scrollY;
    const { state: entry, url } = historyEntry(next);
    // From one view to the next, replace, so Back still returns to the conversation.
    if (isViewEntry(window.history.state)) window.history.replaceState(entry, "", url);
    else window.history.pushState(entry, "", url);
    viewRef.current = next;
    setView(next);
    if (next.kind === "results") window.scrollTo({ top: 0 });
  }, []);

  const openResults = useCallback((id: string) => openView({ kind: "results", id }), [openView]);

  const closeView = useCallback(() => {
    if (isViewEntry(window.history.state)) {
      window.history.back(); // popstate restores the conversation
    } else {
      viewRef.current = CONVERSATION;
      setView(CONVERSATION);
    }
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const next = viewFromHistory(e.state);
      viewRef.current = next;
      setView(next);
      if (next.kind !== "conversation") return;
      requestAnimationFrame(() => {
        const top = scrollToEndOnReturn.current
          ? document.documentElement.scrollHeight
          : scrollBeforeView.current;
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
      setView({ kind: "results", id });
    }
  }, [state.results]);

  // A reload on the details view reopens it.
  useEffect(() => {
    if (isDemo) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") !== "details") return;
    const section = params.get("section") as DetailsSection | null;
    window.history.replaceState({ lucernaDetails: section ?? "all" }, "", window.location.href);
    setView({ kind: "details", section: section ?? undefined });
  }, [isDemo]);

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
        const linked = normalizeDraft(opened.draft);
        updateDraft(linked);
        markRan(linked);
        addResult(opened);
        posthog.capture("full_results_link_opened");
        // The conversation goes underneath, so "Back to conversation" stays on the site
        // even in a fresh tab. The results entry keeps the scenario in its address so
        // the link can still be shared.
        const url = new URL(window.location.href);
        url.searchParams.set("result", opened.result_id);
        window.history.replaceState(null, "", window.location.pathname);
        window.history.pushState({ lucernaResults: opened.result_id }, "", url.toString());
        setView({ kind: "results", id: opened.result_id });
        setLinkStatus("idle");
      })
      .catch(() => setLinkStatus("error"));
  }, [isDemo, keys.conversation, updateDraft, markRan, addResult]);

  // A saved scenario from "My scenarios" or a chat app (?saved=<id>) re-runs and opens
  // its results. Signed-out visitors (often a chat app's own browser) are asked to sign
  // in first, and the scenario loads once they have.
  const savedOpened = useRef(false);
  const [savedNeedsSignIn, setSavedNeedsSignIn] = useState(false);
  const [savedError, setSavedError] = useState(false);
  useEffect(() => {
    if (isDemo || savedOpened.current || !isLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const savedId = params.get("saved");
    if (!savedId) return;
    setSavedNeedsSignIn(!isSignedIn);
    if (!isSignedIn) return;
    savedOpened.current = true;
    const id = `saved-${savedId}`;
    if (loadConversation(keys.conversation)?.results[id]) return; // reload
    setLinkStatus("loading");
    createScenariosApi(getToken)
      .get(savedId)
      .then(async (detail) => {
        const result = (await apiClient.optimize(
          detail.inputs as unknown as Record<string, unknown>
        )) as OptimizationResult;
        // Keep working on this scenario: its values fill the form, and later runs
        // update it rather than saving a copy.
        if (detail.draft) {
          const opened = normalizeDraft(detail.draft);
          updateDraft(opened);
          markRan(opened);
        }
        removeSession(keys.unsaved);
        writeSession(keys.saved, savedId);
        addResult({ result_id: id, label: detail.name, result });
        posthog.capture("saved_scenario_opened");
        window.history.replaceState(null, "", window.location.pathname);
        window.history.pushState(
          { lucernaResults: id },
          "",
          `?view=results&result=${id}&saved=${savedId}`
        );
        setView({ kind: "results", id });
        setLinkStatus("idle");
      })
      .catch(() => {
        setSavedError(true);
        setLinkStatus("idle");
      });
  }, [
    isDemo,
    isLoaded,
    isSignedIn,
    getToken,
    keys.conversation,
    keys.saved,
    keys.unsaved,
    addResult,
    updateDraft,
    markRan,
  ]);

  const applyWhatIf = useCallback(
    (id: string) => {
      const variantDraft = state.results[id]?.draft;
      if (!variantDraft) return;
      replaceDraft(variantDraft);
      posthog.capture("what_if_applied");
    },
    [state.results, replaceDraft]
  );

  // ------------------------------------------------------- "Ask about this"
  const askAbout = useCallback(
    (question: string) => {
      if (viewRef.current.kind !== "conversation") {
        scrollToEndOnReturn.current = true;
        closeView();
      }
      posthog.capture("ask_about_this");
      void send(question);
    },
    [closeView, send]
  );

  // ------------------------------------------------------------------- runs
  const [sheetOpen, setSheetOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Without the assistant, the engine runs the scenario and its results open directly.
  const runDirect = useCallback(
    async (current: ScenarioDraft) => {
      const input = buildScenarioInput(current);
      setRunning(true);
      setRunError(null);
      try {
        const result = (await apiClient.optimize(
          input as unknown as Record<string, unknown>
        )) as OptimizationResult;
        const id = `run-${Date.now().toString(36)}`;
        addResult({ result_id: id, label: "Your scenario", result });
        markRan(current);
        posthog.capture("scenario_completed", { via: "direct" });
        saveResult(id, input, result, current);
        openView({ kind: "results", id });
      } catch {
        setRunError("Your scenario couldn't be run just now. Try again in a moment.");
      } finally {
        setRunning(false);
      }
    },
    [addResult, markRan, saveResult, openView]
  );

  const runScenario = useCallback(async () => {
    const current = draftRef.current;
    if (!isDraftReady(current) || state.streaming || running) return;
    const input = buildScenarioInput(current);
    const viaAssistant = assistantDown.current == null;
    posthog.capture("scenario_submitted", {
      filing_status: input.filing_status,
      num_years: input.timeline?.length ?? 1,
      has_life_events: input.timeline?.some((y) => y.notes && y.notes.trim() !== "") ?? false,
      via: viaAssistant ? "assistant" : "direct",
    });
    setSheetOpen(false);
    setRunError(null);
    if (!viaAssistant) return runDirect(current);

    // The assistant runs it in the conversation, so the result arrives where the
    // follow-up questions happen.
    if (viewRef.current.kind !== "conversation") {
      scrollToEndOnReturn.current = true;
      closeView();
    }
    pendingRun.current = true;
    await send(RUN_MESSAGE);
    // The assistant couldn't run it after all (a limit or an outage): run it here.
    if (pendingRun.current && assistantDown.current != null) {
      pendingRun.current = false;
      await runDirect(draftRef.current);
    }
    pendingRun.current = false;
  }, [state.streaming, running, runDirect, closeView, send]);

  const openDetails = useCallback(
    (section?: DetailsSection) => {
      setSheetOpen(false);
      posthog.capture("scenario_details_opened", { section: section ?? "all" });
      openView({ kind: "details", section });
    },
    [openView]
  );

  // Open the scenario: the panel on desktop (bringing focus to it), the sheet on phones.
  const [revealKey, setRevealKey] = useState(0);
  const showScenario = useCallback(
    (from: "bar" | "strip" | "intro") => {
      if (isDesktop()) {
        choosePanel(true);
        setRevealKey((k) => k + 1);
        posthog.capture("scenario_panel_toggled", { open: true, from });
      } else {
        setSheetOpen(true);
        posthog.capture("scenario_sheet_opened", { from });
      }
    },
    [choosePanel]
  );
  const hidePanel = useCallback(() => {
    choosePanel(false);
    posthog.capture("scenario_panel_toggled", { open: false, from: "hide" });
  }, [choosePanel]);

  // ------------------------------------------------------------- rendering
  const contextValue: ConversationContextValue = useMemo(
    () => ({
      results: state.results,
      streaming: state.streaming,
      send: (text: string) => void send(text),
      openResults,
      applyWhatIf: isDemo ? undefined : applyWhatIf,
      ensureResult,
    }),
    [state.results, state.streaming, send, openResults, isDemo, applyWhatIf, ensureResult]
  );

  // The opening line reflects whether the scenario had values when the conversation began.
  const [introHasDraft, setIntroHasDraft] = useState(false);
  const draftHasValues = hasDraftValues(draft);
  const conversationEmpty = state.messages.length === 0;
  useEffect(() => {
    if (conversationEmpty) setIntroHasDraft(draftHasValues);
  }, [conversationEmpty, draftHasValues]);

  const status = isDemo ? DEMO_STATUS : scenarioStatus(draft, ranKey);
  const panelProps: ScenarioPanelProps = isDemo
    ? {
        draft,
        status,
        eyebrow: "Margaret's scenario",
        heading: (
          <>
            Her <em className="text-pine">numbers.</em>
          </>
        ),
      }
    : {
        draft,
        status,
        highlight,
        onEdit: editDraft,
        onOpenDetails: openDetails,
        onRun: () => void runScenario(),
        runDisabled: !isDraftReady(draft) || state.streaming || running,
        notice: runError,
      };

  const openStored = view.kind === "results" ? state.results[view.id] : undefined;
  const showDetails = view.kind === "details" && !isDemo;
  const sidebarResult =
    (openStored?.result ?? undefined) ||
    (() => {
      const id = latestResultId(state);
      return id ? (state.results[id]?.result ?? undefined) : undefined;
    })();

  const replayDone = !isDemo || state.apiMessages.length > 0;

  let body: ReactNode;
  if (linkStatus === "loading") {
    body = (
      <div className="card animate-pulse text-body-sm text-text-tertiary" role="status">
        Opening your results…
      </div>
    );
  } else if (openStored && view.kind === "results") {
    const isOwn = openStored.label === "Your scenario" && !isDemo;
    const saveState = saveStates[view.id];
    const showBanner =
      AUTH_ENABLED &&
      isOwn &&
      isLoaded &&
      !bannerDismissed &&
      (!isSignedIn || saveState === "saving" || saveState === "saved" || saveState === "failed");
    body = (
      <FullResultsView
        stored={openStored}
        onBack={closeView}
        onApply={isDemo ? undefined : () => applyWhatIf(view.id)}
        eyebrow={view.id.startsWith("saved-") ? "Saved scenario" : undefined}
        banner={
          showBanner ? (
            <SaveResultsBanner
              show
              state={isSignedIn ? saveState : "prompt"}
              onDismiss={() => setBannerDismissed(true)}
              onRetry={() => {
                const failed = failedSaves.current[view.id];
                if (failed) saveResult(view.id, ...failed);
              }}
              signInButton={
                <SignInButton>
                  <GlowButton size="sm">Save with a free account</GlowButton>
                </SignInButton>
              }
            />
          ) : undefined
        }
      />
    );
  } else if (showDetails) {
    body = (
      <ScenarioDetailsView
        draft={draft}
        onDraftChange={changeDraftInForm}
        onSubmit={() => void runScenario()}
        onBack={closeView}
        section={view.section}
        running={running || state.streaming}
      />
    );
  } else {
    body = (
      <>
        {linkStatus === "error" && (
          <div
            role="alert"
            className="rounded-[14px] border border-border bg-paper-warm px-4 py-3 text-body-sm text-text-secondary"
          >
            That results link couldn&apos;t be opened. Describe your situation below to run it
            again.
          </div>
        )}
        {savedError && (
          <div
            role="alert"
            className="rounded-[14px] border border-border bg-paper-warm px-4 py-3 text-body-sm text-text-secondary"
          >
            That saved scenario couldn&apos;t be loaded.
          </div>
        )}
        {savedNeedsSignIn && (
          <SignInRequired
            title="Sign in to open this saved scenario"
            description="It will load here once you're signed in."
            signInButton={
              <SignInButton>
                <GlowButton size="sm">Sign in</GlowButton>
              </SignInButton>
            }
          />
        )}
        <ConversationThread
          state={state}
          followKey={followKey}
          followOnRestore={!isDemo}
          intro={
            isDemo ? (
              <DemoIntro error={demoError} onRetry={() => void startDemo(false)} />
            ) : (
              <AssistantIntro
                hasDraft={introHasDraft}
                empty={state.messages.length === 0}
                onStart={(text) => void send(text)}
                onFillIn={() => showScenario("intro")}
              />
            )
          }
        />
        {isDemo && replayDone && state.messages.length > 0 && !state.streaming && (
          <DemoCta
            onRestart={() => {
              reset();
              setFollowKey(0);
              void startDemo(!reducedMotion);
            }}
          />
        )}
        {!isDemo && state.messages.length > 0 && !state.streaming && (
          <StartOver
            onConfirm={() => {
              reset();
              startNewScenario();
              setFollowKey(0);
              setHighlight([]);
              assistantDown.current = null;
              posthog.capture("conversation_reset");
            }}
          />
        )}
      </>
    );
  }

  // The conversation is a chat shell: the message box stays pinned to the bottom of the
  // screen and the footer steps aside so only the conversation scrolls.
  const chatShell = linkStatus !== "loading" && !openStored && !showDetails;
  // With the panel folded to its strip, the left padding matches the strip so the
  // conversation sits in the middle of the screen.
  const stripShown = !showDetails && !panelOpen;

  return (
    <MethodologyProvider askAbout={askAbout}>
      <Header />
      <MethodologyLayout result={sidebarResult}>
        <div className="flex min-h-[calc(100dvh-69px)] items-start">
          <main
            className={cn(
              "flex min-w-0 flex-1 flex-col self-stretch px-default sm:px-7",
              chatShell ? "pt-section sm:pt-section-lg" : "py-section sm:py-section-lg",
              stripShown && "lg:pl-[72px]",
              panelAnimate &&
                "motion-reduce:transition-none lg:transition-[padding] lg:duration-300 lg:ease-out"
            )}
          >
            <div
              className={cn(
                "mx-auto flex w-full flex-col gap-section",
                chatShell ? cn(CHAT_WIDTH, "flex-1 pb-section") : "max-w-content"
              )}
            >
              {chatShell && <PageIntro isDemo={isDemo} />}
              <div className="flex min-w-0 flex-col gap-section">
                <ConversationContext.Provider value={contextValue}>
                  {body}
                </ConversationContext.Provider>
              </div>
            </div>
            {chatShell && (
              <Composer
                innerClassName={CHAT_WIDTH}
                top={
                  <ScenarioBar
                    status={status}
                    label={isDemo ? "Margaret's scenario" : "Your scenario"}
                    newCount={isDemo ? 0 : detailCount(highlight)}
                    onOpen={() => showScenario("bar")}
                    className={panelOpen ? "lg:hidden" : undefined}
                  />
                }
                onSend={(text) => void send(text)}
                disabled={state.streaming || (isDemo && !replayDone)}
                sample={
                  !isDemo && !introHasDraft && state.messages.length === 0
                    ? SAMPLE_MESSAGE
                    : undefined
                }
                placeholder={
                  isDemo
                    ? "Ask about Margaret's results"
                    : state.messages.length === 0
                      ? "Describe your situation"
                      : undefined
                }
              />
            )}
          </main>
          {/* The details view is the whole scenario as a form, so the panel steps aside. */}
          {!showDetails && (
            <PanelSlot
              revealKey={revealKey}
              open={panelOpen}
              animate={panelAnimate}
              onShow={() => showScenario("strip")}
              onHide={hidePanel}
              {...panelProps}
            />
          )}
        </div>
        {!chatShell && <PageFooter />}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </MethodologyLayout>
      <ScenarioSheet open={sheetOpen} onClose={() => setSheetOpen(false)} {...panelProps} />
    </MethodologyProvider>
  );
}

// ---------------------------------------------------------------------------

/**
 * The desktop panel. The methodology sidebar takes its place while open. Opening the
 * panel (the bar's Review, the strip's arrow) closes that sidebar and brings focus to
 * the panel; hiding it returns focus to the strip.
 */
function PanelSlot({
  revealKey,
  open,
  animate,
  onShow,
  onHide,
  ...props
}: ScenarioPanelProps & {
  revealKey: number;
  open: boolean;
  animate: boolean;
  onShow: () => void;
  onHide: () => void;
}) {
  const methodology = useMethodologyOptional();
  const closeMethodology = methodology?.closeSidebar;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stripRef = useRef<HTMLButtonElement>(null);
  const hide = () => {
    onHide();
    requestAnimationFrame(() => stripRef.current?.focus());
  };

  useEffect(() => {
    if (revealKey === 0) return;
    closeMethodology?.();
    const frame = requestAnimationFrame(() => {
      const heading = headingRef.current;
      heading?.focus();
      // A brief ring so the eye finds the panel.
      heading
        ?.closest("aside")
        ?.animate?.(
          [
            { boxShadow: "inset 0 0 0 2px rgba(45,106,79,0.35)" },
            { boxShadow: "inset 0 0 0 2px rgba(45,106,79,0)" },
          ],
          { duration: 900, easing: "ease-out" }
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [revealKey, closeMethodology]);

  return (
    <ScenarioPanel
      ref={headingRef}
      stripRef={stripRef}
      open={open}
      animate={animate}
      onShow={onShow}
      onHide={hide}
      hidden={methodology?.isOpen}
      {...props}
    />
  );
}

function PageIntro({ isDemo }: { isDemo: boolean }) {
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
  // On desktop the scenario panel carries the heading.
  return (
    <h1 className="display-heading text-display lg:sr-only">
      Run <em>your numbers.</em>
    </h1>
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
  onFillIn,
}: {
  hasDraft: boolean;
  empty: boolean;
  onStart: (text: string) => void;
  /** Open the scenario to type the numbers in directly. */
  onFillIn: () => void;
}) {
  const starters = hasDraft
    ? ["Run my scenario", "Explain what I've entered so far"]
    : ["How do Roth conversions work?"];
  return (
    <div className="flex flex-col gap-default">
      <AssistantBubble>
        <Markdown
          text={
            hasDraft
              ? "I can see the scenario you've started. Tell me what's different, or ask me to run it."
              : "Let's map out your situation. Tell me the month and year you were born, whether you file single or jointly, your income this year, your traditional IRA or 401(k) balance, and when you plan to start drawing on it. A sentence or two is plenty. See the starter prompt below."
          }
        />
        {!hasDraft && (
          <p className="text-[15px] text-text-tertiary">
            Prefer to type the numbers in yourself?{" "}
            <button
              type="button"
              onClick={onFillIn}
              className="font-semibold text-pine underline decoration-border underline-offset-4 transition-colors duration-200 hover:decoration-pine"
            >
              Fill in your scenario
            </button>
          </p>
        )}
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

/** Starts the message box on the calculator, in the order the scenario asks for things. */
const SAMPLE_MESSAGE =
  "I was born in March 1971 and I'm single, with $95,000 of income this year. I have $650,000 in a traditional 401(k) and plan to start drawing on it at 62.";

/** Clearing the conversation can't be undone, so it asks once, inline. */
function StartOver({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  const link =
    "min-h-[36px] text-body-sm underline decoration-border underline-offset-4 transition-colors";
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={cn(link, "self-start text-text-tertiary hover:text-text-primary")}
      >
        Start over
      </button>
    );
  }
  return (
    <div className="flex items-center gap-4 self-start text-body-sm" role="group">
      <span className="text-text-secondary">Clear this conversation?</span>
      <button
        type="button"
        autoFocus
        onClick={onConfirm}
        className={cn(link, "font-semibold text-negative hover:decoration-negative")}
      >
        Clear
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className={cn(link, "text-text-tertiary hover:text-text-primary")}
      >
        Keep it
      </button>
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
    <div className="relative flex flex-col gap-default overflow-hidden rounded-[26px] bg-pine-deep p-comfortable sm:flex-row sm:items-center sm:justify-between sm:p-section">
      <div className="dark-wash" />
      <div className="relative flex flex-col gap-1">
        <h2 className="font-serif text-[24px] font-semibold leading-tight text-white">
          Ready to try yours?
        </h2>
        <p className="text-body-sm text-pine-haze">
          Tell the assistant about your situation and see your own schedule.
        </p>
      </div>
      <div className="relative flex flex-col gap-2 sm:flex-row">
        <Link
          href="/calculator"
          className="btn-paper"
          onClick={() =>
            posthog.capture("cta_clicked", { cta: "try_yours", source: "demo_conversation" })
          }
        >
          Discuss your numbers
        </Link>
        <button type="button" className="btn-outline-paper" onClick={onRestart}>
          Replay example
        </button>
      </div>
    </div>
  );
}
