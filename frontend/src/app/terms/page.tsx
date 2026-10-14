import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection } from "@/components/legal/DocPage";
import { SUPPORT_EMAIL } from "@/lib/utils/constants";

export const metadata: Metadata = {
  title: "Terms of Service | Roth Conversions Optimizer",
  description:
    "The terms for using Roth Conversions Optimizer on the website and in Claude and ChatGPT.",
};

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

export default function TermsPage() {
  return (
    <DocPage
      title="Terms of Service"
      updated="October 14, 2026"
      intro={
        <>
          These terms apply to Roth Conversions Optimizer, run by Barry Wolfson (&quot;we&quot;),
          including the website at rothconversionsoptimizer.com and the app for Claude and ChatGPT.
          By using it you agree to these terms and to our{" "}
          <Link href="/privacy" className="text-pine underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <DocSection id="educational" title="Educational scenario analysis, not advice">
        <p>
          Roth Conversions Optimizer is an educational tool. It models scenarios from the numbers
          you enter and shows estimated outcomes and tradeoffs. It does not provide financial, tax,
          investment or legal advice, and using it does not create an advisory or professional
          relationship.
        </p>
        <p>
          Results are estimates. They depend on your inputs and on assumptions about future tax law,
          investment returns, inflation and your circumstances, any of which can change.
          Explanations written by AI assistants describe the analysis but can make mistakes. Check
          important decisions with a qualified tax or financial professional.
        </p>
      </DocSection>

      <DocSection id="using-the-service" title="Using the service">
        <ul>
          <li>You may use the service for your own planning and for educational purposes.</li>
          <li>
            Don&apos;t misuse it: no attempts to break, overload, scrape at scale or get around
            usage limits, and no use that breaks the law.
          </li>
          <li>
            We apply daily usage limits so the service stays available to everyone, and may change
            them.
          </li>
          <li>
            Don&apos;t enter account numbers, Social Security numbers, passwords or other
            credentials. The tool never needs them.
          </li>
        </ul>
      </DocSection>

      <DocSection id="accounts" title="Accounts">
        <p>
          An account is optional and is used to save scenarios. You are responsible for keeping your
          sign-in secure. You can delete saved scenarios at any time and ask us to delete your
          account by emailing {mail}.
        </p>
      </DocSection>

      <DocSection id="third-party" title="Claude, ChatGPT and other services">
        <p>
          When you use the app inside Claude or ChatGPT, your use of those products is governed by
          Anthropic&apos;s and OpenAI&apos;s own terms. We are not affiliated with or endorsed by
          Anthropic or OpenAI.
        </p>
      </DocSection>

      <DocSection id="changes-to-service" title="Changes and availability">
        <p>
          We may change, pause or discontinue features at any time. We aim to keep the service
          running but don&apos;t promise it will always be available or error free.
        </p>
      </DocSection>

      <DocSection id="disclaimer" title="Disclaimer and limitation of liability">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties
          of any kind, including accuracy, fitness for a particular purpose and non-infringement. To
          the fullest extent the law allows, we are not liable for any indirect, incidental or
          consequential damages, or for any financial or tax outcome of decisions you make, and our
          total liability for any claim is limited to $100.
        </p>
      </DocSection>

      <DocSection id="general" title="General">
        <p>
          These terms are governed by the laws of the United States and the Commonwealth of
          Massachusetts, without regard to conflict of law rules. If we update these terms
          we&apos;ll change the date at the top; continuing to use the service means you accept the
          update. Questions: {mail}.
        </p>
      </DocSection>
    </DocPage>
  );
}
