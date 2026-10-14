import Link from "next/link";
import { PAGE_FOOTER_DISCLAIMER } from "@/lib/utils/constants";
import { Wordmark } from "@/components/common/Wordmark";

const FOOTER_LINKS = [
  { href: "/", label: "Home" },
  { href: "/demo", label: "Demo" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
  { href: "/calculator", label: "Run your scenario" },
  { href: "/feedback", label: "Feedback" },
  { href: "/connect", label: "Claude & ChatGPT" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
] as const;

export function PageFooter() {
  return (
    <footer className="mt-10 border-t border-border px-default pb-10 pt-14 sm:px-7">
      <div className="mx-auto max-w-wide">
        <div className="mb-9 flex flex-wrap items-center justify-between gap-x-10 gap-y-6">
          <Wordmark />
          <nav className="flex flex-wrap gap-x-7 gap-y-2" aria-label="Footer">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[15px] text-text-secondary transition-colors duration-200 hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-4 border-t border-border pt-7">
          <p className="max-w-[760px] text-[13px] leading-relaxed text-text-tertiary">
            {PAGE_FOOTER_DISCLAIMER}
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] text-text-tertiary underline-offset-2 transition-colors duration-200 hover:text-text-secondary hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
