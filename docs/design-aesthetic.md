# Lucerna — Design Aesthetic Spec

**Last updated:** April 2, 2026
**Place in repo:** `docs/design-aesthetic.md`

---

## Design Philosophy — "Warm Midnight"

Lucerna's aesthetic is **warm, sophisticated, and premium**. A dark-mode foundation with golden accents creates a sense of illumination — the core Lucerna metaphor (Latin for light, lamp, lantern). The design sits between institutional confidence and personal warmth: serious enough for retirement savings, but never cold or clinical.

**One sentence:** Lucerna feels like a private wealth tool that was designed by someone who understands both finance and beauty.

**Design principles (in priority order):**
1. **Illuminate, Don't Overwhelm.** Every piece of information should feel like it was placed there to help you see more clearly. If it doesn't illuminate a decision, it doesn't belong on screen.
2. **Warm Precision.** Be exact with numbers but human with language. Data should be pixel-perfect; copy should feel like a knowledgeable friend explaining your options.
3. **Progressive Complexity.** Start simple. Let users peel back layers. The first view should be "here's what to do." The deep view should satisfy Bogleheads.
4. **Respect the Stakes.** People's retirement savings are on the line. No dark patterns, no gamification of serious decisions. Confidence comes from clarity, not persuasion.

**Vibes:** Illuminated, Trustworthy, Premium, Precise, Calm, Forward-Looking.

---

## Reference Calibration

| Product | What to take from it |
|---------|---------------------|
| **ProjectionLab** | Closest competitor / gold standard. Glassmorphic chart tooltips, dark mode as default. Match this polish while differentiating with warmer aesthetics. |
| **Wealthfront** | Deep Mirage base + purple accents. Proves dark + purple creates institutional trust. |
| **Betterment** | Sunglow yellow on deep navy — similar energy to our gold on midnight. |
| **Linear** | Gold standard for keyboard-driven UIs and micro-interactions. Every transition feels intentional. |
| **Vercel** | Masterclass in dark UI. Subtle borders, perfect contrast ratios, elegant gradient usage. |
| **Stripe** | How to make complex financial information navigable. Progressive disclosure, excellent data formatting. |

---

## Typography

**Four-font system:**

| Role | Font | Usage |
|------|------|-------|
| **Display** | DM Serif Display | Page titles, hero text, brand moments. Warm, humanist serif with subtle contrast. |
| **Body** | DM Sans | Descriptions, explanations, tooltips. Geometric but warm, low stroke contrast. Variable 300–700. |
| **UI** | Inter | Buttons, labels, navigation, form inputs, captions. Designed for screens, razor-sharp at small sizes. |
| **Data** | Manrope 700 | Dashboard metrics, chart labels, financial figures. Softer terminals than Inter, generous x-height. Makes numbers feel confident. |

**Type scale:**
```
Display XL:      48px / 800 weight / -0.02em / DM Serif Display
Display:         36px / 700 weight / -0.02em / DM Serif Display
Heading:         24px / 600 weight / -0.01em / DM Sans
Subheading:      18px / 500 weight / DM Sans
Body:            16px / 400 weight / DM Sans
Body small:      14px / 400 weight / DM Sans
Caption/label:   13px / 500 weight / 0.01em / Inter (uppercase sparingly)
Data large:      28px / 700 weight / -0.02em / Manrope
Data hero:       40px / 800 weight / -0.02em / Manrope
```

**Key rules:**
- Financial numbers and metrics use Manrope 700 — this makes numbers feel confident without being aggressive
- Display/brand text uses DM Serif Display — warmth and sophistication
- UI labels and captions use Inter — precise and sharp at small sizes
- Body text is 16px (readable on dark backgrounds)
- Headings use negative letter-spacing for a tight, compressed feel
- Use `font-variant-numeric: tabular-nums` on data columns for alignment

---

## Color System — "Warm Midnight"

### Primary — Dark Foundation
```
Midnight:          #0F0E1A — main page background
Deep Navy:         #1A1832 — card/surface backgrounds, input backgrounds
Plum:              #2D2545 — elevated surfaces, tooltip backgrounds
Charcoal:          #2C2B3A — hover states, subtle emphasis
```

### Accent — Warm Golds
```
Warm Gold:         #F0C674 — primary accent, CTAs, links, active states
Amber Glow:        #E8A838 — hover/active accent, stronger emphasis
Soft Purple:       #6C5CE7 — secondary accent, tags, secondary buttons
Light Lavender:    #B8B0D2 — muted labels, secondary text
```

### Text
```
Cream:             #FAF7F2 — primary text (headings, body)
Warm White:        #F5F0EA — slightly warmer for specific highlights
Lavender:          #B8B0D2 — secondary text
Neutral:           #8B8A99 — tertiary text, placeholders
```

### Supporting — Natural Tones
```
Soft Sage:         #A8C5A0 — growth, positive trends
Sea Glass:         #7EC8C8 — clarity, informational
Rose:              #E8837C — attention, warnings
Trust Blue:        #4A6FA5 — stability, trust signals
```

### Functional
```
Positive:          #5EBD8C — gains, optimal markers, good outcomes
Negative:          #E87070 — costs, losses, bad outcomes
Neutral:           #8B8A99 — baseline, no-change
Caution:           #FBBF24 — warnings, cliff alerts
```

### Glassmorphic Surface Tokens
```
Glass background:  rgba(255, 255, 255, 0.04)
Glass border:      rgba(255, 255, 255, 0.08)
Glass hover:       rgba(255, 255, 255, 0.07)
Glass border hover: rgba(255, 255, 255, 0.15)
```

### Data Visualization Colors
```
Chart income/pre-tax:  #6C5CE7 (Soft Purple)
Chart conversion/roth: #F0C674 (Warm Gold)
Chart taxable:         #A8C5A0 (Soft Sage)
Chart remaining:       rgba(255, 255, 255, 0.04)

Bracket 10%:       #4ADE80 (bright green for dark bg)
Bracket 12%:       #86EFAC
Bracket 22%:       #FBBF24 (bright yellow)
Bracket 24%:       #FB923C (orange)
Bracket 32%:       #F87171 (red)
Bracket 35%:       #EF4444
Bracket 37%:       #DC2626 (dark red)
```

### Gradient Signatures
```
Brand gradient:    linear-gradient(135deg, #0F0E1A 0%, #2D2545 30%, #6C5CE7 60%, #F0C674 100%)
Trust gradient:    linear-gradient(135deg, #1A1832 0%, #4A6FA5 40%, #7EC8C8 70%, #A8C5A0 100%)
Gold accent:       linear-gradient(135deg, #F0C674 0%, #E8A838 100%)
```

### Color Philosophy
- The dark foundation creates focus and premium feel. Color appears to illuminate, not decorate.
- Gold evokes warmth, optimism, and "illumination" — the core Lucerna metaphor.
- Purple provides secondary emphasis without competing with gold.
- Chart colors (purple/gold/sage) carry semantic meaning: pre-tax/roth/taxable.
- The bracket color gradient (green→red) communicates "low brackets good, high brackets costly" intuitively.

---

## Spacing & Layout

### Spacing Scale
```
4px   — micro (icon-to-label, related inline elements)
8px   — tight (compact list items, internal mobile padding)
16px  — default (between cards, between form fields)
20px  — comfortable (card internal padding)
32px  — section (between major content blocks)
48px  — section-lg (between distinct page sections)
64px  — page (top/bottom page padding)
```

### Layout Principles
- **Max content width:** 1080px (keeps data readable)
- **Page margins:** 24px mobile, 48px tablet, auto-centered desktop
- **Grid:** Single column mobile, stacked on desktop for M1
- **Cards:** Glassmorphic with backdrop blur (see Component Patterns)
- **No hero images or illustrations.** The data IS the hero.

---

## Component Patterns

### Cards (Glassmorphic)
```
Background:      rgba(255, 255, 255, 0.04)
Backdrop:        blur(20px)
Border:          1px solid rgba(255, 255, 255, 0.08)
Border radius:   20px
Padding:         20px
Shadow:          none by default
Hover:           translateY(-2px), border rgba(255,255,255,0.12), 300ms ease
```

### The "Recommended" Card Accent
```
Border:          2px solid #F0C674 (Warm Gold)
Glow:            box-shadow 0 0 20px rgba(240, 198, 116, 0.1)
Badge:           "Recommended" — bg rgba(240,198,116,0.15), text #F0C674,
                 11px/500, 8px radius, padding 2px 10px
```

### Buttons
```
Primary:     Gold gradient bg (F0C674 → E8A838), midnight text (#0F0E1A),
             12px radius, height 48px, padding 14px 32px, font 15px/600 DM Sans.
             Hover: translateY(-2px), box-shadow 0 8px 30px rgba(240,198,116,0.25).

Secondary:   Purple glass bg rgba(108,92,231,0.15), soft-purple text,
             1px border rgba(108,92,231,0.3), same sizing.
             Hover: bg rgba(108,92,231,0.25), translateY(-2px).

Ghost:       Transparent, cream text, 1px border rgba(255,255,255,0.12).
             Hover: border rgba(255,255,255,0.25), translateY(-2px).

ALL buttons: 12px radius. Min-height 44px (touch target).
             Transition: 300ms ease. Letter-spacing: 0.3px.
```

### Input Fields
```
Height:          44px
Background:      #1A1832 (Deep Navy)
Border:          1px solid rgba(255, 255, 255, 0.08)
Border radius:   12px
Text:            #FAF7F2 (Cream)
Placeholder:     #8B8A99 (Neutral)
Focus:           border-color #F0C674, ring 0 0 0 2px rgba(240,198,116,0.15)
Font:            16px DM Sans. Numbers in Manrope.
Label:           13px, 500 weight, Inter, Light Lavender, above the field
```

### Navigation / Header
```
Logo: "Lucerna" in DM Serif Display, 18px/600 — the only serif usage in nav.
One or two nav items. CTA: gold glow-button "Run your scenario".
Height: 56px. Border-bottom: 1px solid rgba(255,255,255,0.08).
Background: rgba(15,14,26,0.8) + backdrop-filter blur(12px). Sticky.
```

### Tooltips
```
Background:      #2D2545 (Plum)
Text:            #FAF7F2 (Cream), 13px, DM Sans
Border radius:   12px
Max-width:       280px
Border:          1px solid rgba(255,255,255,0.08)
```

### Metric Cards
```
Label:           13px, 500 weight, Inter, #8B8A99, uppercase tracking
Value:           28px, 700 weight, Manrope, #FAF7F2
Delta:           13px, 600 weight
  Positive:      #5EBD8C with rgba(94,189,140,0.12) bg
  Negative:      #E87070 with rgba(232,112,112,0.12) bg
  Neutral:       #8B8A99 with rgba(255,255,255,0.04) bg
```

---

## Chart & Visualization Style

### Chart Bar Gradient Treatment
All chart bars use bottom-to-top gradient fills that feel translucent and luminous on the dark background:
```
Income/Pre-Tax bars:  #6C5CE7 — opacity 0.7 at bottom, fading to 0.2 at top
Conversion/Roth bars: #F0C674 — opacity 0.7 at bottom, fading to 0.3 at top
Taxable bars:         #A8C5A0 — opacity 0.5 at bottom, fading to 0.2 at top
```
Bars have 8px rounded top corners. The gradient creates depth without competing with data labels.

### ApexCharts Base Config
```javascript
const baseChartConfig = {
  chart: {
    fontFamily: "'Manrope', 'DM Sans', system-ui, sans-serif",
    toolbar: { show: false },
    zoom: { enabled: false },
    background: 'transparent',
    animations: { enabled: true, speed: 600 },
  },
  grid: {
    borderColor: 'rgba(255, 255, 255, 0.06)',
    strokeDashArray: 3,
  },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' },
  },
  legend: { show: false },  // always custom HTML legends
  fill: {
    type: 'gradient',
    gradient: {
      shade: 'dark',
      type: 'vertical',
      shadeIntensity: 0.3,
      opacityFrom: 0.7,
      opacityTo: 0.2,
      stops: [0, 100],
    },
  },
};
```

### Bracket Fill Visualization (Custom SVG)
- Horizontal stacked bars, green→red bracket color scale
- Income segment in Soft Purple (#6C5CE7)
- Conversion in Warm Gold (#F0C674)
- Remaining capacity in rgba(255,255,255,0.04)
- Bar height 34px with 8px gaps
- Labels in 13px Manrope, dollar amounts in 11px Manrope
- Bracket color indicator: 3px vertical bar using bracket colors

### Axis & Label Styling
```
Axis labels:     #B8B0D2 (Lavender) or #8B8A99 (Neutral), 11-12px, Manrope
Grid lines:      rgba(255, 255, 255, 0.06), dashed (strokeDashArray: 3)
Annotations:     rgba(255, 255, 255, 0.08) borders, #8B8A99 label text
```

---

## Interaction & Animation

### Timing
```
UI transitions:    300ms ease (button hovers, card hover, input focus)
Chart animations:  400-600ms (data appearing, bars filling)
Page transitions:  200ms
Glow rotation:     4s linear infinite (glow button border)
```
Interactions should feel graceful and unhurried — calm, like retirement planning should be.

### Hover States
- Buttons: translateY(-2px), shadow appears (300ms)
- Cards: translateY(-2px), border brightens (300ms)
- Links: color shifts to Warm Gold
- Chart elements: tooltip appears, no other change

### Scroll Behavior
- Smooth scroll for section navigation
- Sticky header with backdrop blur
- No parallax or scroll-triggered animations
- Charts animate on first appearance (intersection observer)

---

## Mobile-Specific Rules

### Touch Targets
- All interactive elements: minimum 44px height
- Adequate spacing between tappable elements (minimum 8px gap)

### Layout Adaptations
- Single column layout
- Cards stack vertically
- Metric cards: 2-column grid on mobile
- Charts: full width, minimum 200px height
- Body stays 16px on mobile

---

## What Lucerna Should NEVER Look Like

- No pure white backgrounds (always warm/dark tones)
- No cold blue accents (#2563EB or similar — use warm gold instead)
- No generic fintech aesthetic (cold, corporate, clinical)
- No flat/unstyled cards without glass treatment
- No harsh borders (always subtle, translucent)
- No low-contrast text on dark backgrounds
- No more than TWO accent colors in the UI (gold primary, purple secondary)
- No playful animations (bounce, wobble, confetti)
- No stock photography or illustrations
- No gamification elements
- No light mode (dark is the only mode for now)

---

## Quick Reference for Claude Code

When building any Lucerna component, follow this checklist:
1. Is the background dark (#0F0E1A base, #1A1832 surfaces)?
2. Is the card glassmorphic (rgba bg, backdrop blur, subtle border)?
3. Are display/brand elements in DM Serif Display?
4. Are data/numbers in Manrope 700?
5. Are UI labels/captions in Inter?
6. Is the primary accent Warm Gold (#F0C674), not blue?
7. Is the border-radius 12-20px? (Not smaller)
8. Are transitions 300ms ease for UI elements?
9. Do chart bars use gradient fills (opaque at bottom, translucent at top)?
10. Does it feel warm and premium, not cold and clinical?
