import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { Reveal } from "@/components/common/Reveal";
import { CopyField } from "@/components/common/CopyField";
import { SparkleIcon } from "@/components/common/icons";
import { DocSection } from "@/components/legal/DocPage";
import { AssistantChatPreview } from "@/components/connect/AssistantChatPreview";
import { MCP_SERVER_URL, SUPPORT_EMAIL } from "@/lib/utils/constants";

export const metadata: Metadata = {
  alternates: { canonical: "/connect" },
  title: "Claude & ChatGPT | Roth Conversions Optimizer",
  description:
    "Analyze Roth conversions with Claude or ChatGPT: add Roth Conversions Optimizer to your agent, see what each tool does, and fix common problems.",
};

const FEATURES = [
  [
    "The real math, not a guess",
    "Your agent runs the same multi-year optimizer as this site, with 2026 federal and state brackets, RMDs, IRMAA and ACA subsidies.",
  ],
  [
    "Results right in the chat",
    "Your scenario, the conversion schedule and what-if comparisons appear as cards, with a link to the full analysis here.",
  ],
  [
    "Private, no account needed",
    "It only sees the numbers your agent sends, never your chat history. Sign in only if you want to save scenarios.",
  ],
] as const;

const SETUP = [
  {
    id: "claude",
    name: "Claude",
    steps: [
      "In Claude, open Settings, then Connectors.",
      "Search for Roth Conversions Optimizer and select Connect. If it isn't listed yet, choose Add custom connector and paste the server URL.",
      "Start a chat and ask about Roth conversions.",
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    steps: [
      "In ChatGPT, open Settings, then Apps.",
      "Search for Roth Conversions Optimizer and connect. If it isn't listed yet, turn on Developer mode in the advanced settings, create an app and paste the server URL.",
      "Start a chat and mention the app by name, or just ask about Roth conversions.",
    ],
  },
] as const;

const PROMPTS = [
  "I'm 58, married, earn $140k, have $900k in a traditional IRA and plan to retire at 62. Should I look at Roth conversions?",
  "What if I retired at 65 instead, or moved from California to Nevada?",
  "How does the optimizer decide how much to convert each year?",
  "Save this scenario so I can come back to it.",
] as const;

const TOOLS = [
  [
    "Prepare a scenario",
    "Checks the details you've given so far, shows a summary and lists anything still missing.",
  ],
  [
    "Analyze Roth conversions",
    "Runs the multi-year optimizer and returns the conversion schedule, estimated lifetime tax savings and tradeoffs.",
  ],
  [
    "Compare Roth conversion scenarios",
    "Runs a what-if (retire later, different income, spending or returns) next to your scenario.",
  ],
  ["Get tax brackets", "Looks up federal and state brackets for a filing status and year."],
  ["Explain the methodology", "Explains how the analysis works and what it assumes."],
  ["Save a scenario", "Saves a scenario to your account. Needs sign-in."],
  ["List saved scenarios", "Lists scenarios you've saved. Needs sign-in."],
  ["Open a saved scenario", "Loads a saved scenario so you can pick up where you left off."],
  ["Send feedback", "Sends your feedback or ideas to the developer, only when you ask."],
  ["Report a problem", "Sends a description of something that went wrong, only when you ask."],
] as const;

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

function SectionHeading({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4">
      <span className="eyebrow-pine">{eyebrow}</span>
      <h2 className="display-heading text-display">{children}</h2>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        <section className="relative overflow-hidden px-default pb-16 pt-14 sm:px-7 lg:pb-[70px] lg:pt-24">
          <div className="hero-wash" />
          <div className="relative mx-auto grid max-w-wide grid-cols-1 items-start gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            <div>
              <Reveal className="eyebrow-pine mb-5">For your AI agent</Reveal>
              <Reveal
                as="h1"
                delay={1}
                className="display-heading mb-6 text-[clamp(2.2rem,10vw,3.9rem)] lg:text-[clamp(2.6rem,5vw,3.9rem)]"
              >
                Analyze with
                <br />
                <em>Claude or ChatGPT.</em>
              </Reveal>
              <Reveal
                as="p"
                delay={2}
                className="max-w-[560px] text-[1.08rem] leading-[1.65] text-text-secondary sm:text-[1.2rem]"
              >
                Add Roth Conversions Optimizer to Claude or ChatGPT and ask about your conversions
                in plain words. The analysis comes back as cards in your chat.
              </Reveal>
              <Reveal as="ul" delay={2} className="mt-8 flex flex-col gap-5">
                {FEATURES.map(([title, body]) => (
                  <li key={title} className="flex gap-4">
                    <SparkleIcon size={16} className="mt-1 shrink-0 text-pine" />
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-text-primary">{title}</span>
                      <span className="text-body leading-relaxed text-text-secondary">{body}</span>
                    </div>
                  </li>
                ))}
              </Reveal>
              <Reveal delay={3} className="mt-9 flex flex-col gap-3.5 sm:flex-row sm:flex-wrap">
                <a href="#setup" className="btn-dark">
                  Connect your agent
                </a>
                <a href="#try" className="btn-ghost">
                  Ask your agent
                </a>
              </Reveal>
            </div>
            {/* min-w-0: the chart scrolls inside the card instead of widening the column */}
            <Reveal delay={2} className="min-w-0">
              <AssistantChatPreview />
            </Reveal>
          </div>
        </section>

        <section
          id="setup"
          className="scroll-mt-20 border-y border-border bg-paper-warm px-default py-[72px] sm:px-7 lg:py-[110px]"
        >
          <div className="mx-auto max-w-wide">
            <SectionHeading eyebrow="Set it up">
              Connect in <em>three steps.</em>
            </SectionHeading>
            <div className="mb-8 flex max-w-[640px] flex-col gap-3">
              <p className="text-body text-text-secondary">
                If your agent asks for a server URL, use this one:
              </p>
              <CopyField value={MCP_SERVER_URL} label="server URL" />
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {SETUP.map((app) => (
                <div key={app.id} id={app.id} className="card scroll-mt-24">
                  <h3 className="mb-4 font-serif text-h1 text-text-primary">{app.name}</h3>
                  <ol className="flex flex-col gap-3">
                    {app.steps.map((step, i) => (
                      <li key={step} className="flex gap-3 text-body leading-relaxed">
                        <span className="w-5 shrink-0 font-mono text-caption leading-[1.7] text-sage">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-text-secondary">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="try" className="scroll-mt-20 px-default py-[72px] sm:px-7 lg:py-[110px]">
          <div className="mx-auto max-w-wide">
            <SectionHeading eyebrow="Things to ask">
              Start with <em>your numbers.</em>
            </SectionHeading>
            <ul className="mb-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PROMPTS.map((prompt) => (
                <li
                  key={prompt}
                  className="rounded-[18px] rounded-bl-[6px] border border-border bg-white px-5 py-4 text-body leading-relaxed text-text-primary"
                >
                  &ldquo;{prompt}&rdquo;
                </li>
              ))}
            </ul>

            <h3 className="mb-6 font-serif text-h1 text-text-primary">What the tools do</h3>
            <ul className="grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2">
              {TOOLS.map(([name, description]) => (
                <li key={name} className="flex flex-col gap-1 border-t border-border pt-4">
                  <span className="font-semibold text-text-primary">{name}</span>
                  <span className="text-body-sm leading-relaxed text-text-secondary">
                    {description}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-body-sm text-text-tertiary">
              The analysis tools are read-only. Save a scenario only changes your own account, and
              the feedback tools only send what you ask them to send.
            </p>
          </div>
        </section>

        <section className="border-t border-border px-default py-section-lg md:px-page">
          <div className="mx-auto flex max-w-[720px] flex-col gap-section">
            <DocSection id="sign-in" title="Signing in">
              <p>
                You only need to sign in to save, list or open saved scenarios. The first time you
                ask to save, Claude or ChatGPT shows a sign-in prompt. Scenarios saved from a chat
                also appear on <Link href="/my-scenarios">My scenarios</Link> on this website.
              </p>
            </DocSection>

            <DocSection id="limits" title="Usage limits">
              <p>
                To keep the service available for everyone there is a daily limit on new analyses.
                Signed-in accounts get a higher limit. Recording a scenario, looking up brackets and
                reading the methodology don&apos;t count.
              </p>
            </DocSection>

            <DocSection id="troubleshooting" title="Troubleshooting">
              <ul>
                <li>
                  <strong>The agent doesn&apos;t use the app.</strong> Mention Roth Conversions
                  Optimizer by name, and check the connector is turned on for the chat.
                </li>
                <li>
                  <strong>No result cards appear.</strong> Some apps and surfaces show text only.
                  The numbers are the same, and each result includes a link to the full interactive
                  analysis on this website.
                </li>
                <li>
                  <strong>Sign-in fails or loops.</strong> Disconnect the app, connect it again and
                  retry. If it still fails, email {mail}.
                </li>
                <li>
                  <strong>The daily limit is reached.</strong> Sign in for a higher limit, use the
                  calculator on this website, or try again tomorrow.
                </li>
              </ul>
            </DocSection>

            <DocSection id="privacy" title="Privacy">
              <p>
                The app only receives the scenario values the agent sends for each request. It never
                reads your conversation history. See the <Link href="/privacy">Privacy Policy</Link>
                .
              </p>
            </DocSection>
          </div>
        </section>
      </main>
      <PageFooter />
    </>
  );
}
