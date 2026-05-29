import { PAGE_FOOTER_DISCLAIMER } from "@/lib/utils/constants";

export function PageFooter() {
  return (
    <footer className="border-t border-border px-section py-section md:px-page">
      <div className="mx-auto max-w-content text-body-sm text-text-tertiary">
        <p>{PAGE_FOOTER_DISCLAIMER}</p>
      </div>
    </footer>
  );
}
