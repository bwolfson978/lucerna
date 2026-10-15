import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection } from "@/components/legal/DocPage";
import { SUPPORT_EMAIL } from "@/lib/utils/constants";

export const metadata: Metadata = {
  alternates: { canonical: "/support" },
  title: "Support | Roth Conversions Optimizer",
  description: "Get help with Roth Conversions Optimizer on the website, in Claude or in ChatGPT.",
};

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

export default function SupportPage() {
  return (
    <DocPage
      title="Support"
      intro={
        <>
          Questions, bug reports, data requests and security reports all go to one inbox, read by
          the developer. We usually reply within two business days.
        </>
      }
    >
      <DocSection id="contact" title="Contact">
        <p>
          Email {mail}, or use the <Link href="/feedback">feedback form</Link> to send feedback or
          report a problem without leaving the site.
        </p>
        <p>
          For a problem with a result, include the numbers you entered (or the link to the result)
          and what looked wrong. For a problem in Claude or ChatGPT, say which one and what the
          assistant showed.
        </p>
      </DocSection>

      <DocSection id="common-questions" title="Common questions">
        <p>
          <strong>How do I add it to Claude or ChatGPT?</strong> See{" "}
          <Link href="/connect">Use it in Claude or ChatGPT</Link>, which also covers sign-in and
          troubleshooting.
        </p>
        <p>
          <strong>How do I delete my data?</strong> Delete single scenarios on{" "}
          <Link href="/my-scenarios">My scenarios</Link>, or your whole account in{" "}
          <Link href="/account">Account settings</Link>. To also remove analytics or feedback linked
          to you, email {mail} from the address you signed up with.
        </p>
        <p>
          <strong>How is the analysis calculated?</strong> The{" "}
          <Link href="/methodology">methodology</Link> page explains the math and its assumptions.
        </p>
        <p>
          <strong>Is this financial advice?</strong> No. It is educational scenario analysis. See
          our <Link href="/terms">terms</Link>.
        </p>
      </DocSection>

      <DocSection id="policies" title="Policies">
        <ul>
          <li>
            <Link href="/privacy">Privacy Policy</Link>
          </li>
          <li>
            <Link href="/terms">Terms of Service</Link>
          </li>
        </ul>
      </DocSection>
    </DocPage>
  );
}
