import Link from "next/link";
import { PAGE_FOOTER_DISCLAIMER } from "@/lib/utils/constants";
import { Wordmark } from "@/components/common/Wordmark";

const FOOTER_LINKS = [
  { href: "/", label: "Home" },
  { href: "/demo", label: "Demo" },
  { href: "/methodology", label: "Methodology" },
  { href: "/calculator", label: "Run your scenario" },
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
        <p className="max-w-[760px] border-t border-border pt-7 text-[13px] leading-relaxed text-text-tertiary">
          {PAGE_FOOTER_DISCLAIMER}
        </p>
      </div>
    </footer>
  );
}
