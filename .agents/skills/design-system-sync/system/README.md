Paper & Pine is the look of Roth Conversions Optimizer: a well-made financial publication with explanations you can play with. Warm paper backgrounds, an editorial serif, and one deep pine green that signals growth and money that stays yours. Diagrams carry the story; they animate gently into view, and the important ones are interactive so people can test an idea before they reach the calculator.

The product should feel like a calm, trustworthy planning tool that shows you how the tax code works instead of asking you to trust a number.

## Principles, in priority order

1. **Show the mechanism.** Every big idea (the conversion window, bracket filling, required withdrawals) gets a diagram, ideally one the user can drag or toggle. Reach for BracketChart, ConversionStrip and PaidVsAvoided before prose.
2. **Warm precision.** Numbers are exact and tabular; copy is plain English.
3. **Progressive complexity.** Headline first, detail on scroll or click (Collapsible, ScenarioSummary's assumptions row).
4. **Respect the stakes.** Motion explains, never decorates. No gamification, no confetti.

Vibes: editorial, grounded, clear, calm, trustworthy, alive.

## Content

- Plain English, second person: "Your in-between years are a tax opportunity." "Start with your window." "Year by year detail, save and compare."
- Sentence case for labels, buttons and headings ("Tax on conversions", "Run your scenario"). Uppercase only in mono eyebrows.
- No em dashes in user-facing copy. No emoji.
- Real numbers only: figures on the landing page come from the engine. Anything purely illustrative says "illustrative".
- The wordmark is "Roth Conversions Optimizer." with a pine period; no other product name appears in the UI. "Claude & ChatGPT" always comes first in navigation.

## Color

Paper for grounds, ink for text, pine for the brand, ember for cost. One theme, light.

- **Grounds:** `paper` (= `background`) for the page; `paper-warm` (= `background-alt`) for alternate bands and spotlight cards; `card` (white) for cards, inputs and diagrams; `paper-deep` for hover fills and empty tracks.
- **Lines:** `line` / `border` for every hairline; `border-emphasis` where a hairline disappears; `paper-stone` for axis lines.
- **Text:** `foreground` / `ink` for primary text; `muted-foreground` / `ink-soft` for body and secondary; `tertiary-foreground` for captions and metric labels. `ink-muted` passes 4.5:1 only on `card` and `paper`; on `paper-warm` use `tertiary-foreground`.
- **Pine:** `pine-deep` for primary buttons, dark bands and tooltips (cream `#f5f2ea` text on it); `pine` / `accent` for links, active nav and italic headline phrases; `pine-mid` / `optimal` for conversions and positive values; `sage` for secondary green and the current selection; `pine-mist`, `pine-haze` and `pine-line` for muted text, body text and borders on dark pine.
- **Ember means "this costs you."** `ember` for required withdrawals, cliffs, danger markers and 32%+ brackets, as fills and marks only (3:1 on white). For ember text use `ember-text` on card and paper, or `destructive`. Never use ember for decoration or neutral selection.
- **Data:** `chart-income` (stone) for other income, `chart-conversion` (pine-mid, fading to sage in bars) for Roth conversions, `chart-rmd` (ember) for required withdrawals, `chart-withdrawal` (amber) for withdrawals that fund spending, `chart-social-security` (mist) for the taxable part of Social Security, `chart-remaining` with `chart-remaining-stroke` for room left in a bracket. Brackets run `bracket-10` to `bracket-37`: low brackets read green, high brackets ember. Legends are custom HTML; grid lines `line` or 4–8% ink; axis labels 11–13px Inter in `ink-muted`.
- Never: gold, purple or cold blue accents; dark-mode-only pages; glassmorphism (the retired "Warm Midnight" look).

## Type

Three families, all from Google Fonts: Playfair Display 500/600/700 with italics (`serif`), Inter 400–700 (`sans`, `ui`), IBM Plex Mono 400/500 (`mono`).

- **Display** (`display-xl`, `display`): Playfair 600, -0.015em, fluid from phone to desktop. The signature headline is a plain phrase plus an italic pine phrase, often on two lines (DisplayHeading).
- **Text:** `h1` 30px for page titles in app views, `h3` 16px/600 for card titles, `body` 16px/1.6 for copy, `body-sm` 14px, `caption` 13px/500 for labels above numbers.
- **Data:** big figures in Playfair with lining tabular numerals (`data-hero`, `data-lg` via `.metric-value-hero`, `.metric-value`). Figures in tables and inputs use `.font-data`: Inter with tabular numerals.
- **Labels:** `eyebrow`, 11px Plex Mono uppercase at 0.16em, for captions, section numbers (`01`), years and slider readouts; `eyebrow-pine`, 12px Inter 700 at 0.22em in pine-mid.

## Space, shape and depth

- Spacing steps: `space-micro` 4, `space-tight` 8, `space-default` 16, `space-comfortable` 20, `space-section` 32, `space-section-lg` 48, `space-page` 64.
- Widths: `max-w-wide` 1180px for marketing sections, `max-w-content` 1080px for app views. Gutters 16px on phones, 28px from `sm`. Section bands 72px tall padding on mobile, 110px on desktop, alternating `paper` and `paper-warm` with hairlines.
- Radii: cards `radius-lg` / `radius` 20px (16px on phones); inputs 10px; tooltips `radius-default` 12px; dark bands 26px; buttons, badges and chips fully round.
- Shadows are green-tinted and very soft: `shadow-card-rest` on cards, `shadow-card-hover` with a 5px lift on interactive cards, `shadow-elevated` for menus and tooltips. Cards in a conversation or MCP App iframe use `shadow-conversation`, because iframes clip wider shadows into a grey box.
- Dark bands: `pine-deep`, 26px radius, a radial sage wash in one corner. One data-heavy moment per page and the final call to action.

## Components

- **Buttons** are 44px pills in Inter 15px/600 with 180ms transitions. One pine-deep primary per view (Button `default`, `.btn-dark`); ghost for secondary; on dark bands `.btn-paper` and `.btn-outline-paper`.
- **Cards** are white with a hairline border; `recommended` gets a 2px pine-mid border, `current` ("your selection") a 2px sage border.
- **Inputs** are white, hairline, 10px radius, 44px tall; focus is a pine border plus a 2px pine-mid ring at 15%. Numbers use `.font-data`.
- **Tooltips** are pine-deep with cream text, max 280px.
- **Pills and chips** are fully round, white, hairline, 14–15px Inter 500; floating diagram chips add a soft shadow and a coloured dot.
- **The conversion slider** (ConversionSlider) is the one slider: a 14px round track that deepens from `paper-deep` to `pine` where savings are highest, a diamond at the most savings, and a 28px white thumb ringed in `pine-deep`. Say "Most savings" beside the headline with MostSavingsNote, not on the track.
- The shared cards (ResultCard, ConversionSlider, MostSavingsNote, ScenarioCompareCard, ScenarioSummary, MetricCard, Stat, Steps and the charts) render identically in the web app and inside MCP App Views in Claude and ChatGPT: plain data and callbacks in, no app context.

## Motion

Motion explains how something works. Hovers 180–300ms; reveals 800ms `cubic-bezier(0.2, 0.7, 0.2, 1)` with a 26px lift staggered 100ms; data transitions 500–600ms; ambient loops 1.1–4.5s. Bars grow in once when in view. Every animation respects `prefers-reduced-motion` and shows the final state instead. No bounce, wobble, confetti or parallax.

## Logos and icons

The mark is a rounded pine-deep square with three rising bars in pine-mid, sage and pine-haze, and a fourth bar for the year still to come: a dashed sage outline in `logo.svg`, a 45% pine-mid fill in `icon.svg`. Use `assets/Logos/logo.svg` for the brand mark and `icon.svg` for app icons and favicons; `icon-512.png` and `apple-touch-icon.png` are raster renderings. The wordmark is set in type (Playfair 700, pine period), not drawn. There is no icon set: the UI uses a few inline SVG strokes (chevrons, arrows, a spinner) in `currentColor`.

## Mobile

Single column below `lg`; 44px minimum touch targets; 16px body text; no horizontal page scroll at 390px. Tables drop secondary columns on phones instead of scrolling.

## Not synced

From `bwolfson978/lucerna` at `{{sha}}`. Components were built from the repository (esbuild bundle, Tailwind compiled with `ui/tailwind/preset.js`), so previews run the real code. Colours a component hardcodes in its own source (the chart palettes in `ui/src/colors.ts` used inside SVGs, the conversion slider's track gradient, a few hex borders in `ui/styles/tokens.css`) do not read the tokens; everything styled through Tailwind colour classes does. The fluid `clamp()` display sizes are stored at their desktop maximum. Font files are not stored: the families load from Google Fonts. Not brought in: the app's page-level components (Header, forms, landing explainers) and the motion keyframes in `frontend/src/app/globals.css`. The `animate-in` / `zoom-in` classes on Select and Tooltip have no plugin behind them in the source, so those open without animation here as in the app.
