import { ResultCard, type ResultCardData, type ResultDetails } from "@lucerna/ui";
import { SparkleIcon } from "@/components/common/icons";
import fixture from "../../../../shared/fixtures/view-data.json";

// Real engine output for the scenario in the message below (the same fixture the MCP
// View contracts and stories use), so the preview never shows invented numbers.
const analysis = fixture.analyze_roth_conversions.structured_content;
const result = analysis as unknown as ResultCardData;
// The View's chart data, so the card draws the same bracket chart Claude and ChatGPT show.
const details = fixture.analyze_roth_conversions.view_meta as ResultDetails;

const brackets = [
  ...new Set(
    analysis.schedule_by_year.filter((y) => y.conversion > 0).map((y) => y.marginal_bracket)
  ),
].sort((a, b) => parseFloat(a) - parseFloat(b));
const bracketList =
  brackets.length > 1 ? `${brackets.slice(0, -1).join(", ")} and ${brackets.at(-1)}` : brackets[0];

const QUESTION =
  "I'm 60, married, earning $120k in California with $900k in my 401(k). " +
  "I'm going part-time next year, then retiring to Arizona at 63. Should I look at Roth conversions?";

/** What a chat with the connector looks like: a question, the tool call and its result card. */
export function AssistantChatPreview() {
  return (
    <figure
      aria-label="Example chat: a question about Roth conversions answered with a result card"
      className="flex flex-col gap-4 rounded-[20px] border border-border bg-paper p-4 shadow-[0_24px_60px_-30px_rgba(27,67,50,0.25)] sm:p-6"
    >
      <figcaption className="eyebrow">Example chat in Claude or ChatGPT</figcaption>

      <p className="ml-auto max-w-[88%] rounded-[18px] rounded-br-[6px] bg-paper-warm px-4 py-3 text-body-sm leading-relaxed text-text-primary">
        {QUESTION}
      </p>

      <div className="flex items-center gap-2 text-caption text-text-tertiary">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-light text-pine">
          <SparkleIcon size={11} />
        </span>
        Used <span className="font-medium text-text-secondary">Roth Conversions Optimizer</span>
      </div>

      <ResultCard data={result} details={details} />

      <p className="text-body-sm leading-relaxed text-text-secondary">
        Based on your inputs, the analysis spreads conversions over {result.years_with_conversions}{" "}
        years and keeps them in the {bracketList} brackets. Want to compare retiring at 65?
      </p>
    </figure>
  );
}
