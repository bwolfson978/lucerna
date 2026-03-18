# Lucerna — Design Aesthetic Spec

**Last updated:** March 17, 2026
**Place in repo:** `docs/design-aesthetic.md`

---

## Design Philosophy

Lucerna's aesthetic sits at the intersection of **Linear's discipline** and **ProjectionLab's data richness.** The tool should feel like a serious instrument built by and for people who think analytically — sharp, fast, information-dense, and high-contrast. It should NOT feel like a consumer fintech app (no rounded-everything, no pastel illustrations, no hand-holding).

**One sentence:** Lucerna looks like what would happen if a quant built a financial planning tool and actually cared about design.

**Core principles (in priority order):**
1. **Clarity over decoration.** Every pixel should inform, never decorate. If it doesn't help the user understand their financial situation, remove it.
2. **High contrast, high confidence.** Strong blacks, clean whites, sharp type. The interface should feel decisive, not tentative.
3. **Data is the hero.** Charts, numbers, and visualizations are the primary visual elements — not illustrations, icons, or marketing copy. The data IS the design.
4. **Dense but not cluttered.** Respect the user's intelligence. Show more information, not less — but with rigorous visual hierarchy so the eye knows where to go.
5. **Speed and responsiveness.** Interactions should feel instant. Animations are quick and functional (150-250ms), never slow and decorative.

---

## Reference Calibration

| Attribute | Linear (primary ref) | ProjectionLab (secondary ref) | Lucerna target |
|-----------|---------------------|------------------------------|----------------|
| Whitespace | Compact, efficient | Moderate | Compact — more Linear than ProjectionLab |
| Color usage | Near-monochromatic + one accent | Colorful charts on light bg | Monochromatic UI + colorful data visualizations |
| Typography | Tight, sharp, medium weight | Standard, clean | Tight and sharp like Linear |
| Borders | Subtle, 1px, low opacity | Light borders | Subtle, 0.5-1px, low opacity |
| Border radius | Small (4-6px) | Medium (8px) | Small — 4px default, 6px for cards. NOT rounded/pill-shaped |
| Shadows | Almost none | Subtle card shadows | None. Use borders for elevation, not shadows |
| Information density | High | Medium-high | High — closer to Linear |
| Animations | Snappy, functional | Smooth chart transitions | Snappy for UI, smooth for charts |
| Overall feel | Technical, fast, serious | Polished, approachable, data-forward | Technical and data-forward |

---

## Typography

**Font:** Use a sharp, technical sans-serif. Recommendations (in order of preference):
- **JetBrains Mono** for numbers/data (monospaced, designed for readability of code and numbers)
- **Geist Sans** for body text and UI (Vercel's typeface — sharp, modern, excellent at small sizes)
- Fallback: `system-ui, -apple-system, sans-serif`

**DO NOT use:** Inter (overused in AI tools), Roboto (generic), or any rounded/friendly typeface.

**Type scale:**
```
Display/hero:    36px / 600 weight / -0.02em tracking
H1:              28px / 600 weight / -0.02em tracking
H2:              22px / 600 weight / -0.01em tracking  
H3:              17px / 600 weight / -0.01em tracking
Body:            14px / 400 weight / normal tracking
Body small:      13px / 400 weight / normal tracking
Caption/label:   12px / 500 weight / 0.01em tracking (uppercase sparingly)
Data/numbers:    Use JetBrains Mono at same sizes as body
Large number:    28-36px / 500 weight / JetBrains Mono / -0.02em tracking
```

**Key rules:**
- Numbers should ALWAYS be in the monospaced font — this ensures columns align and dollar amounts are instantly scannable
- Headings use negative letter-spacing (tighter) for that sharp, compressed feel
- Body text is 14px, not 16px — this keeps information density high while remaining readable
- Line height: 1.4 for body, 1.2 for headings, 1.0 for large display numbers

---

## Color System

The UI is near-monochromatic. Color is reserved almost exclusively for data visualization and semantic meaning.

### UI Colors (light mode)
```
Background:        #FFFFFF (primary surfaces)
Background alt:    #FAFAFA (secondary surfaces, input fields)
Background hover:  #F5F5F5
Border:            rgba(0, 0, 0, 0.08) — very subtle
Border emphasis:   rgba(0, 0, 0, 0.15)
Text primary:      #0A0A0A (near-black, not pure black)
Text secondary:    #6B6B6B
Text tertiary:     #9B9B9B (hints, placeholders)
```

### UI Colors (dark mode — design for this eventually, not M1)
```
Background:        #0A0A0A
Background alt:    #141414
Border:            rgba(255, 255, 255, 0.08)
Text primary:      #EDEDED
Text secondary:    #8B8B8B
```

### Accent Color
```
Accent:            #2563EB (a strong, trustworthy blue — used sparingly)
Accent hover:      #1D4ED8
Accent light bg:   #EFF6FF (for badges, highlights)
```
Use the accent color ONLY for: primary CTA buttons, active states, links, and the "optimal" marker in charts. Everything else should be grayscale.

### Data Visualization Colors
These are ONLY used inside charts and the bracket visualization — never in the UI chrome:
```
Bracket 10%:       #22C55E (green — low tax, good)
Bracket 12%:       #86EFAC (lighter green)
Bracket 22%:       #FACC15 (yellow — caution)
Bracket 24%:       #FB923C (orange)
Bracket 32%:       #F87171 (red)
Bracket 35%:       #EF4444 (darker red)
Bracket 37%:       #DC2626 (darkest red)

Optimal marker:    #16A34A (strong green — "this is the good one")
Negative/cost:     #DC2626 (red — tax cost, loss vs optimal)
Neutral/baseline:  #6B7280 (gray — regular income, no-conversion scenario)

Chart line:        #2563EB (accent blue)
Chart fill:        rgba(37, 99, 235, 0.08) (very subtle area fill under curves)
```

### Color Philosophy
- The UI is a quiet, neutral stage. Color appears ONLY when it carries meaning.
- In the bracket visualization, the color gradient from green→yellow→orange→red immediately communicates "low brackets good, high brackets costly" without any text explanation needed.
- The accent blue is used so sparingly that when it appears, it commands attention.

---

## Spacing & Layout

### Spacing Scale
```
4px   — micro (between icon and label, between related inline elements)
8px   — tight (between items in a compact list, internal card padding on mobile)
12px  — default gap (between cards in a grid, between form fields)
16px  — comfortable (section padding on mobile, card internal padding)
24px  — section break (between major content blocks)
32px  — major section (between distinct page sections)
48px  — page-level (top/bottom page padding, between hero and first section)
```

### Layout Principles
- **Max content width:** 1080px (not wider — keeps data readable without excessive eye travel)
- **Page margins:** 24px on mobile, 48px on tablet, auto-centered on desktop
- **Grid:** Use a simple column system. Results page: single column on mobile, sidebar + main on desktop if needed (but prefer stacked single-column for M1)
- **Cards:** No shadow. Border only: `1px solid rgba(0,0,0,0.08)`. Border-radius: 6px. Padding: 16px (mobile) / 20px (desktop).
- **No hero images or illustrations.** The demo results ARE the hero. The first thing a visitor sees is the data.

### Information Density
Follow Linear's approach: pack more information per screen than typical SaaS tools, but use clear visual hierarchy (font size, weight, color) to guide the eye. The target user is comfortable with dense UIs — they use terminals, spreadsheets, and data tools daily.

---

## Component Patterns

### Buttons
```
Primary:     Accent blue bg (#2563EB), white text, 4px radius, 
             height 36px, padding 0 16px, font 14px/500
             Hover: #1D4ED8. Active: scale(0.98).
             
Secondary:   Transparent bg, 1px border rgba(0,0,0,0.15), 
             text-primary color, same sizing as primary.
             Hover: bg #F5F5F5.
             
Ghost:       No border, no bg, text-secondary color.
             Hover: bg #F5F5F5.
             
ALL buttons: 4px radius (NOT rounded/pill). 
             Min-height 44px on mobile (touch target).
             Transition: 100ms ease.
```

### Input Fields
```
Height:          36px (desktop), 44px (mobile)
Border:          1px solid rgba(0,0,0,0.12)
Border radius:   4px
Background:      #FAFAFA
Focus:           border-color: #2563EB, ring: 0 0 0 2px rgba(37,99,235,0.15)
Font:            14px, same as body. Numbers in JetBrains Mono.
Label:           12px, 500 weight, text-secondary, above the field
Helper text:     12px, 400 weight, text-tertiary, below the field
```

### Cards (Metric Cards, Scenario Comparison Cards)
```
Background:      #FFFFFF
Border:          1px solid rgba(0,0,0,0.08)
Border radius:   6px
Padding:         16px (mobile), 20px (desktop)
Shadow:          NONE. Never.
Hover (if interactive): border-color rgba(0,0,0,0.15), bg #FAFAFA

Metric card layout:
  Label:         12px, 500 weight, text-tertiary, uppercase tracking
  Value:         28px, 500 weight, JetBrains Mono, text-primary
  Change/delta:  13px, 500 weight, green (positive) or red (negative)
```

### The "Recommended" Card Accent
```
Border:          2px solid #2563EB (the ONLY element that gets a 2px border)
Small badge:     "Recommended" — bg #EFF6FF, text #1D4ED8, 
                 11px, 500 weight, 4px radius, padding 2px 8px
```

### Navigation / Header
```
Minimal. Logo (text mark "Lucerna" in 18px/600) on the left.
One or two nav items max: "How it works" | "About"
CTA button on the right: "Try it" or "Run your scenario"
Height: 56px. Border-bottom: 1px solid rgba(0,0,0,0.06).
Sticky on scroll.
```

### Tooltips / Info Icons
```
Trigger:         Small (?) icon in text-tertiary color, 14px
Tooltip:         Dark bg (#1A1A1A), white text, 13px, 6px radius,
                 max-width 280px, appears on hover/tap
Use for:         Explaining assumptions ("Full liquidation at end of retirement"),
                 defining terms ("Traditional IRA: a tax-deferred retirement account")
```

---

## Chart & Visualization Style

### General Chart Rules (ApexCharts Configuration)
```javascript
// Base ApexCharts config that all charts should inherit
const baseChartConfig = {
  chart: {
    fontFamily: "'JetBrains Mono', 'Geist Sans', system-ui, sans-serif",
    toolbar: { show: false },
    zoom: { enabled: false },
    background: 'transparent',
    animations: {
      enabled: true,
      easing: 'easeinout',
      speed: 600,  // fast, not slow
    }
  },
  grid: {
    borderColor: 'rgba(0, 0, 0, 0.06)',
    strokeDashArray: 3,  // dashed grid lines, subtle
  },
  tooltip: {
    style: { fontSize: '12px' },
  },
  legend: { show: false },  // always custom HTML legends, never ApexCharts default
  states: {
    hover: { filter: { type: 'none' } },
    active: { filter: { type: 'none' } },
  },
};
```

### Bracket Fill Visualization (Custom SVG)
- Horizontal stacked bars on desktop, vertical stacked bars on mobile
- Colors follow the bracket color scale (green → yellow → orange → red)
- Regular income in neutral gray (#6B7280)
- Conversion amount in accent blue (#2563EB)
- Remaining capacity in very light gray (rgba(0,0,0,0.04))
- Optimal amount marked with a dashed vertical line in green (#16A34A) with a small label
- Bar height: 32px with 8px gaps between brackets
- Labels (bracket rate) on the left axis in 13px/500
- Dollar amounts as inline labels to the right of filled portions in 11px/mono

### NPV / After-Tax Wealth Curve (ApexCharts Area)
- Line: 2px stroke in accent blue (#2563EB)
- Fill: very subtle gradient from rgba(37,99,235,0.08) to transparent
- Optimal point: 6px solid green (#16A34A) dot with white 2px stroke
- Dashed vertical annotation at the optimal point
- Axis labels in 11px monospace
- Smooth curve (tension/spline), not angular

### Point-in-Time Balance Comparison
- Simple grouped bar chart or table with "Without conversion" vs "With conversion" at each age milestone
- Without conversion bars in neutral gray
- With conversion bars split: traditional portion in a muted tone, Roth portion in accent blue
- Clear labels showing the dollar difference

---

## Interaction & Animation

### Timing
```
UI transitions:    100-150ms (button hovers, input focus, card hover)
Chart animations:  400-600ms (data appearing, bars filling)
Tour steps:        200-300ms (element highlighting, tooltip appearing)
Page transitions:  150ms (if any)
```
Everything should feel SNAPPY. Linear's interfaces feel fast because transitions are 100-150ms, not the 300-500ms that most tools use. Lucerna should feel the same.

### Hover States
- Buttons: background color shift (100ms)
- Cards: border darkens slightly (100ms)
- Chart elements: tooltip appears, no other visual change (no glow, no scale, no shadow)
- Links: underline appears (not color change)

### Scroll Behavior
- Smooth scroll when navigating between sections
- Sticky header on scroll
- No parallax, no scroll-triggered animations (too playful for this aesthetic)
- Charts animate on first appearance (intersection observer), not on every scroll

### Loading States
- Skeleton screens (pulsing gray rectangles matching layout) while engine computes
- Streaming text for AI responses (character by character)
- Spinner ONLY for the optimize API call — small, subtle, in the button that triggered it

---

## Mobile-Specific Rules

### Touch Targets
- All interactive elements: minimum 44px height
- Adequate spacing between tappable elements (minimum 8px gap)

### Layout Adaptations
- Single column layout, always
- Cards stack vertically
- Metric cards: 2-column grid on mobile (2x2), not 4 across
- Charts: full width, minimum height 200px
- Bracket viz: switches to vertical stacked bars (one bar per bracket, stacked vertically)
- Chat interface: full-width below results, with suggested question chips horizontally scrollable
- Input form steps: one per screen, large touch-friendly inputs

### Typography Adjustments
- Body stays 14px (don't increase for mobile — density is a feature)
- H1 drops to 24px on mobile (from 28px)
- Large numbers drop to 24px (from 28-36px)
- Metric card labels stay 12px

---

## What Lucerna Should NEVER Look Like

- No gradient backgrounds (except very subtle chart area fills)
- No drop shadows on cards or containers
- No rounded pill-shaped buttons or inputs (4-6px radius max)
- No illustrations, mascots, or decorative imagery
- No pastel color schemes
- No large hero images on the landing page
- No "playful" animations (bounce, wobble, confetti)
- No generic stock photography
- No low-contrast text (everything should be crisp and readable)
- No centered paragraph text (always left-aligned)
- No serif fonts anywhere
- No more than ONE accent color in the UI (blue only; other colors reserved for data)

---

## Quick Reference for Claude Code

When building any Lucerna component, follow this checklist:
1. Is the border-radius 4-6px? (Never larger)
2. Are shadows absent? (Use borders for elevation)
3. Are numbers in JetBrains Mono?
4. Is color used ONLY for data meaning or the single accent blue?
5. Is the spacing tight but clear? (Default to 12px gaps, 16-20px card padding)
6. Is the font size 14px for body, 12px for labels?
7. Is the transition speed 100-150ms for UI, 400-600ms for charts?
8. On mobile: are all touch targets 44px+?
9. Does it feel like Linear, not like Wealthfront?
10. Would a software engineer look at this and think "this is a serious tool"?
