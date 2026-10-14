import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection, DocTerm } from "@/components/legal/DocPage";
import { SUPPORT_EMAIL } from "@/lib/utils/constants";

export const metadata: Metadata = {
  title: "Privacy Policy | Roth Conversions Optimizer",
  description:
    "What Roth Conversions Optimizer collects on the website and in Claude and ChatGPT, why, who processes it, how long it is kept, and how to delete it.",
};

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

export default function PrivacyPage() {
  return (
    <DocPage
      title="Privacy Policy"
      updated="October 14, 2026"
      intro={
        <>
          Roth Conversions Optimizer is run by Barry Wolfson, an individual developer based in the
          United States. This policy covers the website at rothconversionsoptimizer.com and the Roth
          Conversions Optimizer app for Claude and ChatGPT (our MCP server at
          mcp.rothconversionsoptimizer.com). The short version: you can use the analysis without an
          account, we don&apos;t sell your data, and we only keep what you choose to save.
        </>
      }
    >
      <DocSection id="what-we-collect" title="What we collect">
        <DocTerm term="The numbers you enter for an analysis.">
          Age, filing status, state, income, account balances, the age withdrawals begin and similar
          scenario inputs. We use them to run the analysis and send the results back. If you
          don&apos;t save a scenario, we don&apos;t store these inputs.
        </DocTerm>
        <DocTerm term="Saved scenarios.">
          If you sign in and save a scenario, on the website or from a chat, we store its inputs,
          its results, the name you give it and when you saved it, linked to your account.
        </DocTerm>
        <DocTerm term="Account details.">
          Accounts are optional. If you create one, our sign-in provider stores your email address,
          your name if you give one, and your sign-in method. We receive an account ID and your
          email address and name.
        </DocTerm>
        <DocTerm term="Technical data.">
          We use your IP address to apply daily usage limits. These counters are kept in memory and
          reset every day. Our hosting providers keep standard request logs (IP address, time,
          requested URL, user agent) for operations and security.
        </DocTerm>
        <DocTerm term="Website usage and errors.">
          On the website we measure which pages and features are used and collect error reports, so
          we can find bugs and improve the tool. If you are signed in, these are linked to your
          account ID and email.
        </DocTerm>
        <DocTerm term="Website chat messages.">
          When you use the chat on the website, your messages are sent to Anthropic&apos;s Claude
          API to generate replies. We don&apos;t store chat transcripts on our servers.
        </DocTerm>
      </DocSection>

      <DocSection id="claude-and-chatgpt" title="In Claude and ChatGPT">
        <p>
          When you use the app in Claude or ChatGPT, the assistant sends our tools only the scenario
          values needed for each request. Our server does not read, request or store your
          conversation history, memory or files. Anything you type in the chat is handled by
          Anthropic or OpenAI under their own privacy policies.
        </p>
        <p>
          Signing in from a chat is only needed to save, list or open saved scenarios. When you sign
          in, Claude or ChatGPT receives an access token for your Roth Conversions Optimizer
          account, scoped to your profile and email.
        </p>
      </DocSection>

      <DocSection id="how-we-use-it" title="How we use it">
        <ul>
          <li>To run the analysis you ask for and show you the results.</li>
          <li>To save, list and reopen scenarios you choose to save.</li>
          <li>To apply fair usage limits and protect the service from abuse.</li>
          <li>To find and fix bugs and understand which features are useful.</li>
          <li>To answer you when you contact support.</li>
        </ul>
        <p>
          We don&apos;t sell your data, share it for advertising, or use your financial inputs to
          market anything to you.
        </p>
      </DocSection>

      <DocSection id="who-processes-it" title="Who processes it">
        <p>We use these service providers, each only for the purpose listed:</p>
        <ul>
          <li>
            <strong>Clerk</strong>: accounts and sign-in.
          </li>
          <li>
            <strong>Railway</strong>: hosts our API, MCP server and database of saved scenarios.
          </li>
          <li>
            <strong>Vercel</strong>: hosts the website and measures page performance.
          </li>
          <li>
            <strong>PostHog</strong>: website usage analytics and error reports for the website and
            API.
          </li>
          <li>
            <strong>Anthropic</strong>: generates replies for the chat on the website.
          </li>
        </ul>
        <p>
          We may also disclose information if the law requires it, or to protect the service and its
          users.
        </p>
      </DocSection>

      <DocSection id="retention" title="How long we keep it">
        <ul>
          <li>Saved scenarios: until you delete them or delete your account.</li>
          <li>Account details: until you delete your account.</li>
          <li>Usage-limit counters: reset daily, never written to our database.</li>
          <li>Hosting request logs: kept by our hosting providers for up to 30 days.</li>
          <li>Usage analytics and error reports: up to 12 months.</li>
          <li>Unsaved analysis inputs: not stored after the response is sent.</li>
        </ul>
      </DocSection>

      <DocSection id="your-choices" title="Your choices">
        <ul>
          <li>Use the analysis without an account. Signing in is only needed to save.</li>
          <li>
            Delete any saved scenario on <Link href="/my-scenarios">My scenarios</Link>.
          </li>
          <li>
            Ask us to delete your account and everything linked to it, or for a copy of your data,
            by emailing {mail}. We respond within 30 days.
          </li>
          <li>
            Disconnect the app in Claude or ChatGPT at any time from that app&apos;s connector or
            app settings.
          </li>
          <li>Block analytics with your browser&apos;s tracking protection or an ad blocker.</li>
        </ul>
      </DocSection>

      <DocSection id="sensitive-data" title="Sensitive data">
        <p>
          The tool never asks for account numbers, Social Security numbers, passwords or other
          credentials, and you should not enter them. It is not directed at children under 13.
        </p>
      </DocSection>

      <DocSection id="security" title="Security">
        <p>
          All traffic uses HTTPS. Saved scenarios are only returned to the signed-in account that
          saved them. To report a security issue, email {mail}.
        </p>
      </DocSection>

      <DocSection id="changes" title="Changes and contact">
        <p>
          If we change this policy we&apos;ll update the date at the top, and for significant
          changes we&apos;ll note it on the website. Questions about privacy: {mail}.
        </p>
      </DocSection>
    </DocPage>
  );
}
