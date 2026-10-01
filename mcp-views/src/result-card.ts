/**
 * Result card View for `analyze_roth_conversions` (MCP Apps).
 *
 * Runs inside a host's sandboxed iframe (Claude, ChatGPT, or this product's web
 * app). It renders the tool's structuredContent and never fetches anything itself.
 * "See full results" asks the host to open a link; the host decides what to do.
 */

import { App } from "@modelcontextprotocol/ext-apps";

interface ScheduleYear {
  year: number;
  conversion: number;
  tax_on_conversion: number;
  marginal_bracket?: string | number | null;
}

interface AnalysisResult {
  result_id: string;
  estimated_lifetime_tax_savings_todays_dollars: number;
  total_conversion: number;
  total_tax_on_conversions: number;
  years_with_conversions: number;
  schedule_by_year: ScheduleYear[];
}

const SITE = "https://rothconversionsoptimizer.com";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function compact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${amount < 0 ? "-" : ""}$${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (abs >= 100_000) return `${amount < 0 ? "-" : ""}$${Math.round(abs / 1000)}K`;
  return money.format(amount);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function isAnalysis(value: unknown): value is AnalysisResult {
  const v = value as AnalysisResult | undefined;
  return (
    !!v &&
    typeof v.estimated_lifetime_tax_savings_todays_dollars === "number" &&
    Array.isArray(v.schedule_by_year)
  );
}

function stat(label: string, value: string): HTMLElement {
  const box = el("div", "stat");
  box.append(el("span", "label", label), el("span", "value", value));
  return box;
}

function conversionStrip(schedule: ScheduleYear[], tooltip: HTMLElement): HTMLElement {
  const wrap = el("div", "strip");
  const W = 600;
  const H = 64;
  const max = Math.max(1, ...schedule.map((y) => y.conversion));
  const slot = W / Math.max(1, schedule.length);
  const barW = Math.max(4, Math.min(26, slot - 4));
  const chart = svg("svg", {
    viewBox: `0 0 ${W} ${H + 18}`,
    role: "img",
    "aria-label": "Conversion amount by year",
  });
  chart.append(svg("line", { x1: 0, x2: W, y1: H, y2: H, class: "baseline" }));

  schedule.forEach((y, i) => {
    const h = y.conversion > 0 ? Math.max(2, (H - 4) * (y.conversion / max)) : 0;
    const x = slot * i + (slot - barW) / 2;
    const group = svg("g", {
      tabindex: 0,
      role: "img",
      "aria-label": `${y.year}: ${money.format(y.conversion)} converted`,
    });
    group.append(
      svg("rect", { x: slot * i, y: 0, width: slot, height: H, fill: "transparent" }),
      svg("rect", {
        x,
        y: H - h,
        width: barW,
        height: h,
        rx: 3,
        class: "bar",
        style: `animation-delay:${i * 25}ms`,
      })
    );
    const show = () => {
      tooltip.replaceChildren(
        el("span", "tip-year", String(y.year)),
        el("strong", undefined, money.format(y.conversion)),
        el("span", "tip-label", " converted")
      );
      const left = Math.min(Math.max(((x + barW / 2) / W) * 100, 15), 85);
      tooltip.style.left = `${left}%`;
      tooltip.hidden = false;
    };
    group.addEventListener("pointerenter", show);
    group.addEventListener("focus", show);
    group.addEventListener("blur", () => (tooltip.hidden = true));
    chart.append(group);
  });

  const first = svg("text", { x: 0, y: H + 15, class: "axis" });
  first.textContent = String(schedule[0]?.year ?? "");
  const last = svg("text", { x: W, y: H + 15, class: "axis", "text-anchor": "end" });
  last.textContent = String(schedule[schedule.length - 1]?.year ?? "");
  chart.append(first, last);
  chart.addEventListener("pointerleave", () => (tooltip.hidden = true));
  wrap.append(chart, tooltip);
  return wrap;
}

function render(root: HTMLElement, data: AnalysisResult, onOpen: () => void): void {
  const card = el("article", "card");
  card.dataset.testid = "result-card";

  const head = el("div", "head");
  head.append(
    el("span", "eyebrow", "Estimated lifetime tax savings"),
    el("span", "hero", money.format(data.estimated_lifetime_tax_savings_todays_dollars)),
    el("span", "caption", "In today's dollars, compared with not converting")
  );

  const stats = el("div", "stats");
  stats.append(
    stat("Converted", compact(data.total_conversion)),
    stat("Tax cost", compact(data.total_tax_on_conversions)),
    stat("Years", String(data.years_with_conversions))
  );

  const tooltip = el("div", "tooltip");
  tooltip.hidden = true;
  tooltip.setAttribute("role", "status");

  const footer = el("div", "footer");
  const button = el("button", "btn", "See full results");
  button.type = "button";
  button.addEventListener("click", onOpen);
  footer.append(button, el("span", "caption", "Slider, scenario comparison, year-by-year table"));

  card.append(head, stats, conversionStrip(data.schedule_by_year, tooltip), footer);
  root.replaceChildren(card);
}

function renderMessage(root: HTMLElement, text: string): void {
  root.replaceChildren(el("p", "message", text));
}

const root = document.getElementById("root")!;
const app = new App({ name: "Roth conversion result", version: "1.0.0" }, {}, { autoResize: true });

app.ontoolresult = (result) => {
  if (result.isError) {
    renderMessage(root, "The analysis couldn't run for this scenario.");
    return;
  }
  const data = result.structuredContent;
  if (!isAnalysis(data)) {
    renderMessage(root, "No result to show.");
    return;
  }
  render(root, data, () => {
    const url = new URL("/calculator", SITE);
    url.searchParams.set("view", "results");
    url.searchParams.set("result", data.result_id);
    void app.openLink({ url: url.toString() });
  });
};

app.ontoolcancelled = () => renderMessage(root, "The analysis was cancelled.");

renderMessage(root, "Running the optimizer…");
await app.connect();
