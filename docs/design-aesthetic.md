# Lucerna — Design Aesthetic Spec

**Last updated:** October 1, 2026
**Place in repo:** `docs/design-aesthetic.md`
**Replaces:** "Warm Midnight" (dark mode, gold accents), retired October 2026.

---

## Design Philosophy — "Paper & Pine"

Lucerna looks like a well-made financial publication with explanations you can play with: warm paper backgrounds, an editorial serif, and one deep pine green that signals growth and money that stays yours. Visual explanations (diagrams, bracket bars, timelines) carry the story. They animate gently as they come into view, and the important ones are interactive so people can test an idea before they reach the calculator.

The visual reference is flowscope.com's "explain the mechanism with a live diagram" style, adapted for retirement tax planning.

**One sentence:** Lucerna feels like a calm, trustworthy planning tool that shows you how the tax code works instead of asking you to trust a number.

**Design principles (in priority order):**
1. **Show the mechanism.** Every big idea (the conversion window, bracket filling, RMDs) gets a diagram, ideally one the user can drag or toggle.
2. **Warm precision.** Numbers are exact and tabular; copy is plain English.
3. **Progressive complexity.** Headline first, then the detail on scroll or click.
4. **Respect the stakes.** Motion explains, never decorates. No gamification, no confetti.

**Vibes:** Editorial, Grounded, Clear, Calm, Trustworthy, Alive.

---

## Typography

**Three-font system:**

| Role | Font | Tailwind | Usage |
|------|------|----------|-------|
| **Display** | Playfair Display 600/700 (+ italic) | `font-serif` | Headlines, big metric values, wordmark |
| **Body / UI** | Inter 400–700 | `font-sans` (default), `font-ui` | Body copy, buttons, labels, table numbers |
| **Mono** | IBM Plex Mono 400/500 | `font-mono` | Small uppercase captions, section numbers (`01`), years, slider readouts |

`.font-data` = Inter with `tabular-nums`. Use it for financial figures in tables and inputs. `DATA_FONT_FAMILY` / `dataFontStyle` in `lib/utils/constants.ts` are the SVG and inline-style equivalents.

**Signature headline pattern:** a plain phrase plus an italic pine phrase, often on two lines.

```tsx
<h2 className="display-heading text-display">
  Fill your brackets,<br /><em>not the IRS&rsquo;s.</em>
</h2>
```

`.display-heading` sets Playfair 600, -0.015em tracking and 1.06 line height, and turns `<em>` italic pine.

**Type scale:**
```
display-xl:  clamp(3rem, 7vw, 5.4rem)    Playfair 600   hero h1
display:     clamp(2.1rem, 4.4vw, 3.4rem) Playfair 600  section h2
h1:          30px                         page titles inside app views
h3:          16px / 600                   card titles
body:        16px / 400 Inter
body-sm:     14px
caption:     13px / 500
eyebrow:     11px Plex Mono, uppercase, 0.16em tracking   (.eyebrow)
eyebrow-pine:12px Inter 700, uppercase, 0.22em, pine-mid  (.eyebrow-pine)
metric-value / metric-value-hero: Playfair, tabular lining numerals
```

---

## Color System

### Paper (backgrounds)
```
paper        #fafafa  page background (bg-bg, bg-paper)
paper-warm   #f0ede6  alternate bands, spotlight cards (bg-bg-alt, bg-paper-warm)
paper-deep   #e9e5dc  hover, empty tracks (bg-paper-deep)
stone        #cfc9ba  "other income" segments, axis lines (bg-paper-stone)
white        #ffffff  cards, inputs, diagrams (bg-card)
line         #e4e0d6  all hairline borders (border-border)
```

### Ink (text)
```
ink          #141414  primary text
ink-soft     #3d3d3d  secondary text, body copy
muted        #6b6b6b–#737373  tertiary text, captions
```

### Pine (brand)
```
pine-deep    #0b1d15  primary buttons, dark bands (register, CTA), tooltips
pine         #1b4332  links, active nav, italic headline phrases (accent)
pine-mid     #2d6a4f  conversion segments, positive values (optimal)
sage         #66a183  secondary green, gradient end, step numbers
pine-mist    #8fae9c  muted text on dark pine
pine-haze    #b9c9bd  body text on dark pine
pine-line    #1e3a2e  borders on dark pine
```

### Ember (the only warm accent)
```
ember        #f26522  RMDs, cliffs, "danger" markers, 32%+ brackets
ember-text   #c2410c  ember for text on light backgrounds (text-negative)
```
Ember means "this costs you." Do not use it for decoration or for neutral selection states.

### Data visualization (`CHART_COLORS`, `BRACKET_COLORS`)
```
Other income / pre-tax:  #bdb6a4 stone
Roth conversion:         #2d6a4f pine-mid (gradient to #66a183 sage in bars)
Required withdrawal:     #f26522 ember
Remaining bracket space: rgba(20,20,20,0.025) with #e4e0d6 stroke

Bracket 10%  #4f8f6f   12% #7fae8f   22% #c9a443
Bracket 24%  #e58a3c   32% #f26522   35% #cf4a17   37% #a3360f
```
Low brackets read green, high brackets read ember. Keep `tailwind.config.ts`, `globals.css` and `constants.ts` in sync when changing any of these.

---

## Layout

- **Max width:** 1180px for marketing sections (`max-w-wide`), 1080px for app views (`max-w-content`).
- **Gutters:** 16px on phones, 28px from `sm`.
- **Section rhythm:** 72px vertical padding on mobile, 110px on desktop. Alternate paper and paper-warm bands with hairline borders.
- **Two-column explainer:** copy on one side, white "visual" card on the other; flip sides on alternating sections. Stack on mobile with the copy first.
- **Dark bands:** `bg-pine-deep`, 26px radius, a radial sage wash (`.dark-wash`) in a corner. Use for one data-heavy moment per page (the register) and the final CTA.

---

## Components

### Cards
```
White background, 1px #e4e0d6 border, 20px radius, 32px padding (16px on phones).
Shadow: 0 24px 60px -34px rgba(27,67,50,0.22). Green-tinted, very soft.
Hover (interactive cards only): translateY(-5px) + shadow-card-hover.
.card-recommended  2px pine-mid border
.card-current      2px sage border ("your selection")
```

### Buttons (pills)
```
.btn-dark          pine-deep bg, cream text. Hover: pine bg, lift 2px, soft shadow.
.btn-ghost         transparent, hairline border. Hover: ink border.
.btn-paper         paper bg, pine-deep text. For dark bands.
.btn-outline-paper translucent cream border. Secondary action on dark bands.
All: radius 999px, 44px min height, 15px/600 Inter, 180ms transitions.
<Button> (components/ui/button.tsx) uses the same language.
```

### Header
Sticky, 68px tall, `bg-paper/80` with 14px backdrop blur and a hairline bottom border. "Roth Conversions Optimizer." wordmark (Playfair 700, pine period; no product name appears in the UI) on the left; Demo, Methodology, "How does it work?" and a `.btn-dark` "Run your scenario" on the right. On phones: wordmark, help button, hamburger.

### Inputs
White background, hairline border, 10px radius, 44px min height. Focus: pine border plus a 2px pine-mid/15 ring. Numbers use `.font-data`.

### Tooltips
Pine-deep background, cream text, 12px radius, max 280px.

### Pills and chips
Rounded-full, white background, hairline border, 14–15px Inter 500. Floating diagram chips get a soft shadow and a colored dot.

---

## Motion

Motion is the main difference from the old spec. It should explain how something works.

| Pattern | Where | Implementation |
|---------|-------|----------------|
| Scroll reveal (fade + 26px lift, staggered 100ms) | Section copy and cards | `<Reveal delay={n}>` + `.reveal` |
| Flowing dashed path, travelling dots, pulse rings | Hero conversion diagram | `.flow-path`, SVG `animateMotion`, `.pulse-ring` |
| Gentle bob | Floating chips | `.float-chip` |
| Bars filling | Bracket bars, mini charts | CSS width/scale transitions on in-view |
| Line drawing | Mini line charts | `pathLength=1` + `stroke-dashoffset` transition |
| Count-up and row stagger | Conversion register | rAF count-up, 110ms row delays |
| Blinking status dot | "Scheduled" | `.blink-dot` |

**Timing:** UI hovers 180–300ms; reveals 800ms `cubic-bezier(0.2,0.7,0.2,1)`; data transitions 500–600ms; ambient loops 1.1–4.5s.

**Rules:**
- Every animation must respect `prefers-reduced-motion`. Use `usePrefersReducedMotion()` and the CSS media query; show the final (or a representative static) state.
- Animations start when the element is in view (`useInView`) and run once, except ambient loops in the hero.
- No bounce, wobble, confetti or parallax.

### Interactive explainers
Landing explainers should let people move a slider or toggle and see the result immediately:
- **IncomeWindowMap:** retirement age, Social Security age and RMD age (73/75) reshape the conversion window.
- **BracketFiller:** a conversion amount and other income pour into the real 2026 brackets (from `useTaxConfig`), with tax, average rate and top bracket.
- **LandingDemo:** the register and Margaret stats come from `/api/demo`, so the landing page never shows numbers the engine did not produce. Purely illustrative visuals must say "illustrative".

Use `RangeControl` (`components/landing/RangeControl.tsx`) for sliders: pine filled track, white-ringed thumb, mono readout.

---

## Charts

- Light backgrounds: ApexCharts `theme: "light"`, `shade: "light"` gradients.
- Grid and axis lines: `rgba(20,20,20,0.04–0.08)` or `#e4e0d6`. Axis labels `#5c5c5c`/`#737373`, 11–13px Inter.
- Conversion bars use pine-mid with a vertical fade; income bars stone; RMDs ember.
- Custom HTML legends only.

---

## Mobile

- Single column below `lg` for explainers; the hero diagram switches to a vertical flow below `sm`.
- 44px minimum touch targets; 16px body text.
- Tables drop secondary columns (status, age) on phones rather than scrolling horizontally.
- No horizontal page scroll at 390px. Check with Playwright (`document.documentElement.scrollWidth`).

---

## Never

- Dark-mode-only pages or glassmorphism (the old system).
- Gold, purple or cold blue accents.
- Ember used decoratively.
- Numbers on the landing page that did not come from the engine, unless clearly labeled illustrative.
- Em dashes in user-facing copy.
- Motion that ignores reduced-motion preferences.

---

## Quick checklist

1. Paper background, white cards, hairline `#e4e0d6` borders?
2. Headline in Playfair with an italic pine phrase?
3. Captions in Plex Mono uppercase, body in Inter, numbers tabular?
4. One pine primary action (pill), ember only for costs and danger?
5. Is there a diagram that explains the idea, and can the user interact with it?
6. Does the animation run on view and respect reduced motion?
7. Works at 390px with no horizontal scroll?
