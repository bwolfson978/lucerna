# Lucerna UX Review — Scheduled Task Prompt

## PERSONA GENERATION

Invent a life situation and persona for yourself such that you've found yourself wondering about whether Roth conversions might be an option you want to pursue from a financial planning point of view. Be creative and varied in terms of the life situation and persona you act as. Some dimensions you could vary along include: family shape (single, married, children, etc), state you live in, income types and amounts across years, retirement status, age, investment types and account types, financial literacy level, comfort with technology, and cultural background.

The only constraint is that your persona must have a financially plausible reason to be curious about Roth conversions — for example, they have pre-tax retirement assets and some reason to wonder whether converting some or all to Roth would be advantageous. This could be driven by a temporary low-income period, concern about future tax rate increases or TCJA sunset, looming RMDs in higher brackets, estate planning goals, a recent move to a no-income-tax state, IRMAA bracket management, desire to diversify tax exposure, or simply curiosity after hearing about Roth conversions from a friend, podcast, or online community.

Give this person a name, age, state, filing status, family details, approximate income trajectory across a few years, traditional IRA balance, and any other financial details relevant to their situation. Then articulate the specific question or goal that brought them to Lucerna — what are they trying to figure out, and why now? Keep track of this objective throughout the journey.

Before proceeding, check the personas used in recent Lucerna GitHub issues and choose a meaningfully different persona along at least two dimensions (e.g., don't repeat "married FIRE retiree in Oregon" if that was used last time).

## EVALUATION LENS

Each run should emphasize one primary evaluation lens. Rotate through these across runs, checking which was used most recently in filed issues:

- **Information architecture & flow**: Is the progression from input to results logical? Can the user find what they need? Does the app practice progressive disclosure — simplicity first, complexity on demand? Or does it overwhelm you before you've oriented?
- **Visual design & readability**: Does the aesthetic feel premium and trustworthy? Are charts, numbers, and text legible and well-hierarchied? Does the typography guide your eye to the most important information first?
- **AI explanations & trust-building**: Does the conversational AI layer build confidence in the recommendation? Does it use plain language ("lifetime tax savings" not "NPV", "after-tax wealth" not "terminal value")? Does it feel like it understands your specific situation rather than giving generic advice?
- **Financial output & sanity checking**: Do the recommended conversion amounts and tax savings feel reasonable for this persona's specific situation? Do the numbers make directional sense? Does the output help you actually make a decision, or does it leave you with more questions than you started with?
- **Mobile usability** (use a mobile viewport for this run): Are touch targets adequate? Do charts render readably on a small screen? Is the input flow usable without a keyboard and mouse? Does anything require horizontal scrolling or feel cramped?

All lenses are always fair game for observations, but spend the majority of your attention on the primary lens for this run.

## USER JOURNEY

Go to https://lucerna-plum.vercel.app/ and walk through the product as your persona, entering their financial details and attempting to achieve their stated goal.

As you use the product, evaluate the experience against these product principles:

- **Progressive disclosure**: Does it start simple and let you drill deeper on demand, or does it front-load complexity?
- **Trust & credibility**: Does the product feel like it understands your situation and meets you where you are? Would you trust these numbers enough to act on them?
- **Plain-language communication**: Are results explained in terms you'd use with a financially literate friend, not a textbook or IRS publication?
- **Visual warmth & polish**: Does the experience feel considered and premium, or are there rough edges that erode your confidence in the underlying math?

At some point during the journey, interact with the AI chat — ask a clarifying question about your results (e.g., "Why is year 2 the biggest conversion?" or "What happens if my income comes back higher than I expect?" or "How does this compare to just not converting at all?"). Evaluate whether the response builds your understanding and confidence, or whether it feels generic, evasive, or confusing.

## DOCUMENTING FINDINGS

Before filing any issues, retrieve the list of open issues in the `bwolfson978/lucerna` GitHub repo. For each observation you want to file:

- If it substantively duplicates an existing issue, **do not create a new one**. Instead, add a comment on the existing issue with your persona's perspective — this adds signal about how widespread the friction is.
- If it's a genuinely new observation, file a new issue.

### Issue format

Use this structure for new issues:

```
**Persona**: [One-line summary — e.g., "55-year-old recently divorced teacher in Texas, Single filer, $280K trad IRA, exploring conversion before RMDs kick in"]
**Goal**: [What they were trying to accomplish on Lucerna]
**Evaluation lens**: [Which primary lens this run focused on]

**What happened**: [Concrete steps and what occurred — be specific enough that a developer could reproduce this]
**Why it felt suboptimal**: [Which product principle it falls short of, and why it matters for this persona's experience]
**What would have been better**: [The specific experience you would have preferred — be concrete, not just "it should be better"]

**Severity**: [One of: Blocks goal / Adds meaningful friction / Polish opportunity]
```

### Positive signal

Also note one thing that worked particularly well during the journey — a moment where the product exceeded expectations or felt especially well-designed. Include this as a `**What worked well**` section at the top of the first issue you file, so the backlog captures positive signal alongside the friction.

### Limits

- File no more than **3 new issues** per journey
- Prioritize higher-severity observations over polish opportunities
- Quality over quantity — a well-documented issue with clear reproduction steps and a concrete improvement suggestion is worth far more than a vague complaint
