# Methodology Sidebar — Design Spec

**Date:** 2026-04-06
**Status:** Ready for implementation
**Phase:** 1 (Sidebar panels; dedicated methodology page is phase 2)

---

## Motivation

Users see optimization results and think "why should I believe this?" The methodology sidebar builds trust by showing rigor and transparency at the moments skepticism peaks — without requiring the user to leave the results view.

---

## Architecture: Hybrid Approach

One unified "How It Works" sidebar with five accordion sections, accessible via two entry points.

### Entry Point 1: Top-level "How does it work?" button

- Lives in the `Header` component nav area
- Visible on all pages but only functional on pages with results (`/demo`, `/calculator`). On the landing page it links to the future `/methodology` page (phase 2); until then, hidden on `/`
- Opens the sidebar with all accordion sections collapsed
- For diffuse skepticism: "I don't trust any of this yet"

### Entry Point 2: Per-component contextual triggers

- Small `InfoTrigger` buttons on each results component
- Opens the SAME sidebar but auto-expands and scrolls to the relevant accordion section
- Shows a "Jumped to: [section name]" context badge at the top of the sidebar
- Highlights the trigger that was clicked (gold accent state)
- For specific skepticism: "this particular number seems wrong"

### Key design decision: Personalized trigger labels

Trigger labels are scenario-aware, not static. They derive from `OptimizationResult.reasoning_trace`:

| Component | Trigger label (dynamic) | Condition |
|-----------|------------------------|-----------|
| Hero metric card | "How is this calculated?" | Always shown |
| Bracket chart | "Why stop at the {rate}% bracket?" | When optimizer stopped mid-bracket |
| Bracket chart | "Why convert into the {rate}% bracket?" | When optimizer enters a bracket partially |
| Scenario cards | "Why is full conversion worse?" | When full conversion is suboptimal |
| Detail table | "How is this allocated across years?" | When `income_trajectory.length > 1` |
| Balance projections | "What assumptions drive these projections?" | Always shown |
| ACA subsidy section | "How do conversions affect subsidies?" | When `aca_subsidy_impact` is present |

---

## Sidebar Behavior

### Desktop (>=1024px)
- Slides in from right edge, results area narrows (split layout)
- Sidebar width: 400px fixed
- Both results area and sidebar transition together

### Tablet/Mobile (<1024px)
- Full-height drawer/overlay from right (max-width 420px on tablet, 100% on phone)
- Semi-transparent backdrop: `rgba(15, 14, 26, 0.7)`
- Body scroll locked when open

### Shared behavior
- Sidebar stays open as user scrolls results
- If sidebar is already open and a different trigger is clicked: updates to new section
- Dismissible via X button or Escape key
- On mobile, tapping the backdrop also closes

### Transition
- Duration: 350ms
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`

---

## Accordion Sections (5 total)

### 1. Your Savings Number
**Section ID:** `savings-number`
**Triggered by:** Hero metric card

- What the headline number means (difference in after-tax wealth)
- Why "today's dollars" — discount rate in plain English
- What's included: conversions, growth, withdrawals, terminal value

### 2. Tax Bracket Filling
**Section ID:** `bracket-filling`
**Triggered by:** Bracket chart

- How brackets work as "buckets" filling bottom-up
- Where the optimizer stopped and why (references the user's actual stopping bracket)
- Why bracket fill changes year-to-year (income trajectory)

### 3. The Conversion Trade-Off
**Section ID:** `conversion-tradeoff`
**Triggered by:** Scenario cards

- Pay tax now at current rate vs. pay tax later at retirement rate
- Why full conversion is worse (pushes into higher brackets)
- Why zero conversion leaves money on the table
- The sweet spot: marginal cost equals marginal benefit

### 4. Multi-Year Allocation
**Section ID:** `multi-year-allocation`
**Triggered by:** Detail table (only for multi-year trajectories)

- Optimizer redistributes across years (not evenly)
- Low-income years get priority (more bracket room = cheaper conversions)
- Personalized: references the user's actual trajectory shape

### 5. Assumptions & Limitations
**Section ID:** `assumptions-limitations`
**Triggered by:** Balance projections, assumptions disclaimer

- 7% growth rationale (long-term equity market average)
- 5% discount rate rationale (time value of money)
- What's not included: state taxes, RMDs, Social Security, IRMAA
- Future roadmap transparency

### Connective tissue
- Each section ends with "Read our full methodology" link (placeholder for phase 2)
- Context badge shown when opened from per-component trigger, hidden from header button

---

## Content Principles

- Plain English for financially literate non-professionals
- "The analysis shows" not "you should"
- Educational framing, not financial advice
- Never leak engine internals ("SLSQP", "dynamic programming", "scipy", "NPV")
- Translate: "tests thousands of conversion schedules" not "multi-restart constrained optimization"
- "Estimated lifetime tax savings" not "net present value"
- "Today's dollars" not "discounted cash flow"

---

## Components

### New files

| File | Purpose |
|------|---------|
| `src/components/methodology/MethodologySidebar.tsx` | Sidebar container with header, context badge, scrollable accordion body |
| `src/components/methodology/AccordionSection.tsx` | Reusable collapsible built on existing Radix Collapsible |
| `src/components/methodology/InfoTrigger.tsx` | Per-component "How is this calculated?" button |
| `src/components/methodology/HowItWorksButton.tsx` | Header nav button |
| `src/components/methodology/MethodologyContext.tsx` | React context for sidebar state |
| `src/components/methodology/methodology-content.ts` | Static + dynamic content that accepts `OptimizationResult` |
| `src/components/methodology/__tests__/MethodologySidebar.test.tsx` | Vitest tests |
| `src/components/methodology/__tests__/InfoTrigger.test.tsx` | Vitest tests |

### Modified files

| File | Change |
|------|--------|
| `src/components/common/Header.tsx` | Add `HowItWorksButton` to nav |
| `src/components/results/ResultsView.tsx` | Wrap in `MethodologyProvider`, add sidebar, adjust layout for split mode |
| `src/components/results/BracketChart.tsx` | Add `InfoTrigger` |
| `src/components/results/ScenarioCards.tsx` | Add `InfoTrigger` |
| `src/components/results/TransposedDetailTable.tsx` | Add `InfoTrigger` |
| `src/components/results/BalanceProjections.tsx` | Add `InfoTrigger` |
| `src/components/results/AcaSubsidyImpact.tsx` | Add `InfoTrigger` |
| `src/app/globals.css` | Sidebar transition classes, accordion animation |

All paths relative to `frontend/`.

---

## State Management

React context (`MethodologyContext`) at the results page level:

```typescript
interface MethodologyState {
  isOpen: boolean;
  activeSection: string | null;       // section ID to auto-expand
  activeTrigger: string | null;       // which trigger opened sidebar
  openSidebar: (section?: string, trigger?: string) => void;
  closeSidebar: () => void;
}
```

- `openSidebar()` with no args: all sections collapsed, no badge (header button)
- `openSidebar('bracket-filling', 'bracket-chart')`: auto-expands section, shows badge, highlights trigger
- If sidebar already open + different trigger clicked: updates section + trigger
- Close resets both `activeSection` and `activeTrigger`

Provider wraps the results view. Both `/demo` and `/calculator` include it.

---

## Design Tokens

All tokens match the existing Warm Midnight system:

- **Sidebar background:** `#1A1832` (Deep Navy / `bg-alt`)
- **Sidebar border:** `rgba(255, 255, 255, 0.08)`
- **Sidebar width:** 400px desktop, 100% mobile
- **Accordion header hover:** `rgba(255, 255, 255, 0.06)`
- **Highlighted section:** gold left-border `rgba(240, 198, 116, 0.35)` with subtle glow
- **Section sub-headers:** `#F0C674` (accent), Inter 12px uppercase
- **Body text:** `#B8B0D2` (lavender), DM Sans 13.5px
- **InfoTrigger default:** `text-muted`, transparent bg
- **InfoTrigger hover/active:** gold text, `rgba(240, 198, 116, 0.15)` bg
- **Context badge:** gold text, accent-dim bg, pill shape, Inter 11px
- **"Read our full methodology" link:** gold, Inter 13px, arrow icon

---

## Responsive Behavior

- **>=1024px:** Split layout. Results get `max-width` reduction, sidebar 400px fixed right.
- **<1024px:** Drawer overlay from right with backdrop. Max-width 420px on tablet.
- **Transitions:** 350ms `cubic-bezier(0.4, 0, 0.2, 1)` on both results area and sidebar.

---

## Accessibility

- Sidebar: `<aside role="complementary" aria-label="How it works">`
- Close button: `aria-label="Close methodology sidebar"`
- Accordion headers: `<button>` with `aria-expanded`, `aria-controls`
- Content panels: `role="region"`, `aria-labelledby` header
- Focus trap on mobile overlay
- Focus moves to sidebar on open, returns to trigger on close
- Escape key closes sidebar

---

## Reuse: Existing Radix Collapsible

The codebase has `@radix-ui/react-collapsible` at `src/components/ui/collapsible.tsx`. `AccordionSection` builds on this primitive rather than adding a dependency. Each section uses controlled `open` state to support auto-expand from contextual triggers.

---

## Verification Plan

1. Run frontend, navigate to `/demo` or `/calculator` with results
2. Click "How does it work?" — sidebar opens, all accordions collapsed, no badge
3. Click any InfoTrigger — sidebar opens, scrolls to + expands relevant section, shows badge
4. Click different trigger while open — updates to new section
5. Close via X — sidebar dismisses, trigger deactivates
6. Press Escape — closes
7. Test at <1024px — renders as drawer with backdrop
8. Tap backdrop — closes
9. Verify plain English content (no engine internals)
10. Verify personalized trigger labels match scenario
11. Vitest: sidebar state, accordion state, trigger-to-section mapping, badge visibility
12. Keyboard: tab through triggers, enter opens, tab within sidebar, escape closes

---

## Implementation Sequence

1. `MethodologyContext` — state management foundation
2. `AccordionSection` — reusable collapsible on Radix primitive
3. `MethodologySidebar` — container with header, badge, scrollable body, close button
4. `methodology-content.ts` — content strings + dynamic generators accepting `OptimizationResult`
5. `InfoTrigger` — per-component button with active state
6. `HowItWorksButton` — header button
7. Integration into `Header.tsx`, `ResultsView.tsx`, and results components
8. Responsive drawer behavior, backdrop, scroll lock
9. CSS transitions and animations in `globals.css`
10. Vitest tests

---

## Prototype Reference

A working HTML prototype at `prototype/methodology-sidebar/index.html` demonstrates the hybrid approach with both entry points, accordion behavior, context badge, and auto-scroll-to-section.

---

## Out of Scope (Phase 2)

- Dedicated `/methodology` page with full-length content and diagrams
- Math notation in accordion content
- Analytics tracking (which sections expand, which triggers clicked)
- "Was this helpful?" micro-feedback per section
