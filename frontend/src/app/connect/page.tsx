import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection } from "@/components/legal/DocPage";
import { MCP_SERVER_URL, SUPPORT_EMAIL } from "@/lib/utils/constants";

export const metadata: Metadata = {
  title: "Use it in Claude or ChatGPT | Roth Conversions Optimizer",
  description:
    "Add Roth Conversions Optimizer to Claude or ChatGPT, see what each tool does, and fix common problems.",
};

const TOOLS = [
  [
    "Record a scenario",
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

export default function ConnectPage() {
  return (
    <DocPage
      title="Use it in Claude or ChatGPT"
      intro={
        <>
          Ask Claude or ChatGPT about Roth conversions and it can run the same optimizer as this
          website, with interactive result cards in the chat. No account is needed for the analysis.
        </>
      }
    >
      <DocSection id="server-url" title="Server URL">
        <p>If you add it by URL, use:</p>
        <code className="block break-all rounded-md border border-border bg-bg-alt px-4 py-3 font-mono text-body-sm text-text-primary">
          {MCP_SERVER_URL}
        </code>
      </DocSection>

      <DocSection id="claude" title="Add it to Claude">
        <ol>
          <li>In Claude, open Settings, then Connectors.</li>
          <li>
            Search the directory for Roth Conversions Optimizer and select Connect. If you
            don&apos;t see it, choose Add custom connector and paste the server URL above.
          </li>
          <li>Start a chat and ask about Roth conversions.</li>
        </ol>
      </DocSection>

      <DocSection id="chatgpt" title="Add it to ChatGPT">
        <ol>
          <li>In ChatGPT, open the Apps directory and search for Roth Conversions Optimizer.</li>
          <li>Select it and connect.</li>
          <li>Start a chat and ask about Roth conversions, or mention the app by name.</li>
        </ol>
      </DocSection>

      <DocSection id="try" title="Things to ask">
        <ul>
          <li>
            &quot;I&apos;m 58, married, earn $140k, have $900k in a traditional IRA and plan to
            retire at 62. Should I look at Roth conversions?&quot;
          </li>
          <li>&quot;What if I retired at 65 instead, or moved from California to Nevada?&quot;</li>
          <li>&quot;How does the optimizer decide how much to convert each year?&quot;</li>
          <li>&quot;Save this scenario so I can come back to it.&quot;</li>
        </ul>
      </DocSection>

      <DocSection id="tools" title="What the tools do">
        <ul>
          {TOOLS.map(([name, description]) => (
            <li key={name}>
              <strong>{name}</strong>: {description}
            </li>
          ))}
        </ul>
        <p>
          The analysis tools are read-only. Save a scenario only changes your own account, and the
          feedback tools only send what you ask them to send.
        </p>
      </DocSection>

      <DocSection id="sign-in" title="Signing in">
        <p>
          You only need to sign in to save, list or open saved scenarios. The first time you ask to
          save, Claude or ChatGPT shows a sign-in prompt. Scenarios saved from a chat also appear on{" "}
          <Link href="/my-scenarios">My scenarios</Link> on this website.
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
            <strong>The assistant doesn&apos;t use the app.</strong> Mention Roth Conversions
            Optimizer by name, and check the connector is turned on for the chat.
          </li>
          <li>
            <strong>No result cards appear.</strong> Some apps and surfaces show text only. The
            numbers are the same, and each result includes a link to the full interactive analysis
            on this website.
          </li>
          <li>
            <strong>Sign-in fails or loops.</strong> Disconnect the app, connect it again and retry.
            If it still fails, email {mail}.
          </li>
          <li>
            <strong>The daily limit is reached.</strong> Sign in for a higher limit, use the
            calculator on this website, or try again tomorrow.
          </li>
        </ul>
      </DocSection>

      <DocSection id="privacy" title="Privacy">
        <p>
          The app only receives the scenario values the assistant sends for each request. It never
          reads your conversation history. See the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </DocSection>
    </DocPage>
  );
}
