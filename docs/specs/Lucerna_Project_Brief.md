# Lucerna — Project Brief

**Product Name:** Lucerna
**Domain:** getlucerna.com
**Tagline:** See your financial future clearly
**Last updated:** March 17, 2026

---

## 1. Vision & Thesis

### The Problem
Roth conversion optimization during low-income windows is a well-understood strategy in retirement planning, but the concept applies much more broadly to anyone experiencing a temporary income dip — startup founders, sabbatical-takers, career transitioners, people between jobs, new parents on unpaid leave. The advice to "consider a Roth conversion" is everywhere; the tools to answer "exactly how much should I convert, and over what time horizon?" barely exist.

### The Insight
Existing tools fall into two camps that leave a large segment underserved:
- **Free brokerage calculators** (Fidelity, Schwab, NerdWallet): Only answer "should I convert?" — not "how much?" or "over how many years?"
- **Paid DIY software** ($120–$290/yr — Pralana, MaxiFi, Boldin, ProjectionLab): Powerful but complex, designed for "optimizer hobbyists" willing to spend 20+ hours learning the tool. Steep learning curves, dated interfaces, and significant feature gaps (e.g., Boldin doesn't model ACA subsidies; MaxiFi has asset allocation bias; ProjectionLab has no auto-optimizer)

### The Gap
There is no tool that combines **multi-year optimization depth** with a **modern, accessible UI** at a **price point that matches episodic use.** The underserved segment is the "Informed DIYer" — financially literate, knows what a Roth conversion is, wants the right answer without becoming a tax optimization expert.

### The Product (Immediate)
A focused, sharp multi-year Roth conversion optimizer that:
- Finds the optimal conversion schedule across a user-defined low-income window
- Uses progressive disclosure via conversational AI to explain recommendations
- Feels like TurboTax meets a financial advisor, not a spreadsheet
- Targets the Informed DIYer who won't pay an advisor but doesn't want to build their own model

### The Broader Vision: Financial Thought Partner for Life Transitions
The Roth conversion optimizer is the sharpest, best-defined wedge into a larger opportunity. The real product vision is a **thought partner for all your "what if" / "what should I do" financial simulations and scenario planning.**

Nobody sits down and says "I need to optimize my Roth conversion." They say "I'm quitting my job to start a company — what are the financial implications?" or "I'm taking time off — what should I do with my money?" The Roth conversion is one answer to a broader question: *given a life change, what financial moves should I make?*

**Life transitions as the organizing principle:**
- "I'm starting a company" → Roth conversions during low K-1 years, but also entity structuring implications, self-employed retirement accounts
- "I'm retiring early" → Roth conversion ladders, but also Social Security timing, drawdown sequencing, ACA cliff management
- "I'm taking a sabbatical" → Roth conversions, but also 0% LTCG harvesting, charitable giving bunching
- "I'm going back to school" → Roth conversions, but also capital gains harvesting, ACA insurance planning

The conversational AI layer being built for Roth conversions becomes the connective tissue for this broader experience. Each financial strategy is a module powered by the same architecture: **deterministic engine + AI explanation layer.** The product doesn't tell you what to do — it helps you explore what happens if you do X vs. Y.

**Implications for how we build:**
1. **Naming:** "Lucerna" (Latin for lamp/light) accommodates the broader vision — illuminating your financial future, not just "Roth converter"
2. **Architecture:** Design the AI interaction layer to be module-agnostic. The system of "engine produces reasoning trace → AI explains it conversationally" should work identically across Roth conversions, capital gains harvesting, or Social Security timing. Don't hard-code Roth-specific logic into the conversation layer
3. **Positioning:** Include a brief "coming soon" or vision statement in the product that signals the broader direction. Builds anticipation and helps early users understand they're getting in early on something bigger
4. **Don't build any of this yet.** Ship the Roth conversion module first. Validate demand. Expand only after Phases 1–3 prove the model works

---

## 2. Target Audience

### Primary: The Informed DIYer
- Financially literate (understands tax brackets, knows what a Roth is)
- DIY-inclined (won't pay $2,500+ for an advisor)
- Not an "optimizer hobbyist" (won't spend 20 hours configuring Pralana)
- Has a bounded conversion window (2–15 years) and needs the tool during that window
- Wants to understand the recommendation, not just trust a black box
- Price-sensitive relative to $120+/year subscriptions for episodic use

### Life Situations (Concrete Use Cases)
1. **FIRE / Early Retirees** — Largest, most motivated segment. Gap between retirement (median age 62) and RMDs (age 73–75). ~975K subscribers in r/financialindependence
2. **Startup Founders** — Left salaried employment, paying themselves little or nothing. Pass-through losses may create additional opportunities. This is the demo persona for M1
3. **Sabbatical/Career Transitioners** — 6–18 months of low or zero income between roles
4. **Graduate Students (MBA, PhD, Medical)** — 2–5 year low-income window. Prior full-time income with existing 401k/IRA rollovers
5. **Unpaid Parental Leave** — Shorter window but still exploitable
6. **Pre-Retirees (55–65)** — Traditional retirement window. Larger balances, higher stakes, more complexity (Social Security, Medicare)

### Secondary: The Newly Aware
- Just learned Roth conversions exist
- Needs qualification ("is this relevant to me?") before optimization
- Served by the free tier; some graduate into primary segment

### Explicitly NOT Targeting
- Bogleheads power users who build MILP models and enjoy the complexity
- People who want a comprehensive retirement planner (refer to Boldin/MaxiFi)
- People who want/need a human financial advisor

---

## 3. Competitive Landscape

### Free Calculators (Not Real Competition — Different Category)
| Tool | What It Does | Key Limitation |
|------|-------------|----------------|
| Fidelity | Single-year convert vs. don't | No optimization, no multi-year |
| Schwab | Single-year comparison | No bracket filling |
| NerdWallet | Future value comparison | No tax bracket modeling |
| Vanguard | Basic comparison | Advisor-facing only |

### Paid DIY Software (Primary Competitive Set)
| Tool | Price | Strengths | Weaknesses |
|------|-------|-----------|------------|
| **Pralana Online** | $119/yr | Best tax code fidelity, handles ACA/IRMAA/SS | Steep learning curve, dated UI, "daunting for someone overwhelmed by numbers" |
| **MaxiFi** | $149/yr | Patented auto-optimizer, maximizes lifetime spending | Black box, asset allocation bias, doesn't model ACA |
| **Boldin** | $144/yr | Best UI, algorithmic Roth Explorer | No ACA subsidy modeling, requires full retirement plan setup |
| **ProjectionLab** | $129/yr | Beautiful design, FIRE community favorite | No auto-optimizer — manual input only |
| **WealthTrace** | $289/yr | Recently added optimizer | "Very primitive" per user reviews |
| **i-ORP** | Free | Linear programming optimizer | Creator deceased, outdated brackets, buggy |
| **RPM** | Free | Powerful, customizable | "Monster of confusion," manual trial-and-error |

### Key Takeaway
No tool combines: (1) comprehensive multi-variable optimization, (2) modern accessible design, (3) transparent calculations, and (4) affordable pricing for episodic use.

---

## 4. Demand Validation Evidence

### Quantitative Signals
- **$34.5B** in Roth conversions occurred in 2020 alone
- **37 million U.S. households** hold traditional IRAs with $10+ trillion in assets
- **57.9 million households (44%)** own some type of IRA
- **4.1 million Americans** turning 65 in 2025; ~11,200 exiting workforce daily
- **59%** of retirees stop working before age 65
- FIRE subreddit: ~975K subscribers; Bogleheads subreddit: ~628K (up from <20K in 2020)

### Qualitative Demand Signals
- **Dozens of dedicated Bogleheads threads** spanning 2013–2025, many with 50–200+ replies, asking for Roth conversion optimization tools
- Users building DIY solutions including a **Mixed Integer Linear Programming model** with 2,022 variables and 2,580 constraints
- Community member response to that model: "I think you might actually have the foundation for building a validated software model you can market"
- Users paying **$5,000+ for CFP Roth conversion analysis** and finding software ($149/yr) superior
- Q3 Advisors built an **entire advisory practice exclusively around Roth conversion planning**
- Recurring pattern: users try tools → find them inadequate → build own spreadsheets → spreadsheets break under complexity

### The Usability Gap (Direct Quotes)
- "Looking for a tool where the UI is more user friendly — but accurate calculations and assessments is top of importance"
- "Pralana beats the competition... But since it doesn't hide the complexity, it would be daunting for someone overwhelmed by numbers"
- "I tried to figure out how to use RPM, but I lost patience and decided it would be easier to make my own spreadsheet"
- "I don't like that the calculations are hidden. I pretty much had to put the numbers into a spreadsheet to verify the results"
- "I looked over all the available calculators but could not see one that solved for the size of recommended Roth conversions by year while also checking [ACA, SS, LTCG, Medicare] simultaneously"

---

## 5. Product Direction

### Core Engine: Multi-Year Optimizer
Given a user's current situation and expected income trajectory over N years, find the conversion schedule (amount per year) that maximizes after-tax wealth.

**Must-model variables (M1 — single year):**
- Federal tax brackets (progressive, 2025 rates)
- Standard deduction / filing status (Single + MFJ with simplified spousal model)
- Traditional IRA / 401k balance and growth
- Roth balance and growth
- Current year income (+ spouse income for MFJ)
- Expected future income and years until normal income resumes
- Configurable: retirement age, years in retirement, annual retirement spending, growth rate, discount rate

**Must-model variables (M2 — multi-year):**
- Year-by-year income trajectory across N low-income years
- ACA premium tax credit interaction
- 0% LTCG bracket interaction / capital gains harvesting tradeoff

**Model in future versions:**
- State taxes
- Social Security taxation torpedo
- IRMAA (Medicare premium surcharges)
- RMD projections (using IRS Uniform Lifetime Table)
- Survivor/widow tax bracket changes
- Estate planning / generational wealth transfer (inherited IRA treatment under 10-year rule)

**Scoping note — estate planning:** M1 assumes full liquidation at end of retirement (person dies with zero). This is a simplifying assumption, noted transparently in the UI. In reality, including estate planning would tip scales further toward Roth (inherited Roth = tax-free withdrawals; inherited traditional = taxable). This is a high-value future expansion but adds significant complexity (heir tax brackets, bequest amounts).

### Results Presentation (User-Facing Terminology)
The engine internally uses NPV as the optimization objective, but **"NPV" is never shown to users.** User-facing language:

- **Headline metric:** "Estimated lifetime tax savings" (the delta between optimal and no-conversion)
- **Chart y-axis (wealth curve):** "Impact on after-tax wealth (today's dollars)"
- **Primary results view:** Point-in-time balance comparisons at key ages (today, retirement, end of retirement) — "With conversion vs. without conversion" showing traditional and Roth balances. These are intuitive and don't require understanding discounting
- **Secondary view (for the analytically curious):** The full after-tax wealth curve across all conversion amounts, year-by-year balance projections, sensitivity analysis
- **When users ask "what point in time does this correspond to?":** The AI explains: "This represents the total value of all after-tax dollars flowing from your retirement accounts over your lifetime, expressed in today's purchasing power. It's not a balance at any one date — it's the cumulative spending power across your entire retirement."

### Key Architectural Decision: AI as Explanation Layer
The product should be architected from the ground up with conversational AI as a core interaction paradigm, not a bolt-on feature.

**Three AI integration points:**
1. **Guided input collection** — Conversational onboarding instead of form-heavy UI. Infer defaults from context, catch input errors
2. **Progressive disclosure of recommendations** — Headline result first, then drill down via conversation. "Why not convert more?" "What if my income changes?"
3. **Scenario exploration** — User asks follow-up questions the tool designers couldn't anticipate. AI re-runs optimization with modified assumptions and explains deltas

**Critical architecture principle:** The optimization engine must be **deterministic and auditable** (not AI-generated). The engine produces a structured "reasoning trace" at each decision point. The AI layer translates this into natural language. **The engine does the math; the AI explains the math.**

### Design Aesthetic
- **Sharp and modern** (think Vercel, Stripe)
- Progressive disclosure: simplicity first, complexity on demand
- Bracket visualization as the "aha moment" — horizontal stacked bar (desktop) / vertical stacked bars (mobile) showing how income + conversion fills each bracket
- Plain English labels throughout — no financial jargon without explanation
- Counterfactual comparison: show optimal vs. do-nothing vs. over-convert
- Mobile-responsive from the start (many users arrive from Reddit on phones)

### Tech Stack (Locked)
| Layer | Tech | Hosting |
|-------|------|---------|
| Frontend | Next.js 14+ (App Router) + TypeScript + Tailwind | Vercel |
| Backend | Python + FastAPI + Pydantic | Railway |
| AI | Anthropic Claude Sonnet (called from backend) | Via backend |
| Charts | ApexCharts (standard charts) + Custom SVG (bracket viz) | — |
| Email | Resend + database | — |
| Analytics | PostHog (free tier) | — |
| Repo | Monorepo (frontend/ + backend/), separate CI/CD per service | GitHub |

### Monetization (Phased Approach)

**At MVP launch: Everything is free.** No paywalls, no pricing. Maximum usage, maximum feedback, maximum email collection.

**Target tier structure (to be validated by behavioral pricing test):**
- **Free forever:** Single-year optimizer with bracket visualization + limited AI questions (3–5 per session). Must be good enough that people share it — this is the distribution engine
- **Paid tier (hypothesis: $39–$59/year or $5–$9/month):** Multi-year optimizer, unlimited AI conversation, saved scenarios, PDF export. Core product for the Informed DIYer
- **Possible one-time option ($79–$99):** For people who hate subscriptions and have a bounded conversion window. To be validated

**Pricing principles:**
- Stay under $100/year to position below the $119–$149 incumbent DIY tools that serve a different (power user) segment
- Price must match episodic use pattern — people use this intensively for 2–15 years, not forever
- Don't introduce actual pricing until there's product-market fit signal (organic sharing, return visits, waitlist demand)
- Behavioral pricing test (Stripe test mode with variable early-bird pricing) activated once traffic supports it — no stated-preference surveys (people lie about willingness to pay; revealed preference from actual card-on-file reservations is the gold standard)
- Free tier must remain genuinely useful, not a crippled teaser — it doubles as the viral distribution engine

---

## 6. Legal & Regulatory Framing

### The Core Distinction: Education vs. Advice
In the U.S., providing personalized financial advice for compensation generally requires registration as an investment adviser under the Investment Advisers Act of 1940. However, providing educational tools, calculators, and general information is typically not considered investment advice — as long as you're careful about framing.

**The key legal test (Investment Advisers Act):** A person is an investment adviser if they (1) provide advice about securities, (2) for compensation, (3) as a business. Financial calculators and educational tools generally don't meet this test because they provide information and analysis, not personalized recommendations.

**Critical nuance for an AI-powered tool:** A traditional calculator that shows tax implications of different conversion amounts is clearly educational. An AI that says "you should convert $47,200 this year" starts to feel more like personalized advice. The "thought partner" framing is important not just for product positioning but for legal positioning — the product helps users explore scenarios, it doesn't tell them what to do.

### Design Principles for Legal Compliance
These aren't just disclaimer text — they should be embedded in the product's interaction patterns:

**1. Language patterns throughout the UI and AI responses:**
- Never "you should" — always "this analysis suggests" or "the model shows" or "based on your inputs"
- Frame outputs as analysis of scenarios, not directives: "Converting $47,200 would fill your 12% bracket without entering the 22% bracket" rather than "Convert $47,200"
- The AI system prompt must enforce this framing consistently
- This actually makes for *better UX* for the Informed DIYer audience — they want to understand the analysis and make their own call

**2. Show options, not answers:**
- Present multiple scenarios and their tradeoffs (convert $30K vs. $47K vs. $60K — here's what each looks like)
- This is inherently educational and empowers the user
- Contrast with: showing one "optimal" answer and saying "do this" (feels more like advice)

**3. Layered disclaimers (prominent but non-annoying):**
- **Inline on every results page:** Brief statement — "This tool provides estimates for educational purposes and is not financial, tax, or investment advice. Consult a qualified professional before making financial decisions."
- **Detailed disclaimer page:** Accessible from footer, covering: tool provides estimates only, results depend on assumptions that may not reflect reality, tax laws are complex and change frequently, the tool is not a substitute for professional advice, no guarantee of accuracy or outcomes
- **AI conversation layer:** Periodic contextual reminders — e.g., when a user asks "so should I do this?", the AI can respond with the analysis AND note "I'd recommend discussing this with a tax professional before executing, especially given [specific complexity in their situation]"
- **Terms of service:** Users acknowledge the tool is educational, not advisory

**4. What the product is NOT:**
- Not a registered investment adviser
- Not providing personalized financial advice
- Not guaranteeing any outcomes
- Not a substitute for consultation with a qualified tax/financial professional

### Industry Precedent
FINRA's own tools use the template: "These calculators are designed to be informational and educational tools only, and when used alone, do not constitute investment advice." Every major brokerage and fintech tool follows this pattern. The addition of an AI explanation layer is novel but doesn't change the fundamental nature of the product — it's still a calculator that shows analysis based on user inputs, just with a more accessible explanation mechanism.

### Recommendation
Consult with a lawyer before launch (especially one familiar with fintech/investment adviser regulations) to review the specific implementation, particularly around how the AI frames its responses. Budget $1,000–$3,000 for a legal review.

---

## 7. Go-to-Market Strategy

### Beachhead: FIRE Community
- **Pre-launch:** Educational posts on r/financialindependence with real analysis. Share insights, not the tool. Build credibility
- **Launch:** Post free tool with demo. Frame as "I built this because I couldn't find a good Roth conversion optimizer"
- **Growth:** Free tier is the viral loop. Content from the tool's outputs as distribution

### Key Channels
1. r/financialindependence (~975K subscribers)
2. Bogleheads.org forum (older, wealthier, actively seeking tools)
3. r/Bogleheads (~628K subscribers)
4. Personal finance Twitter/X
5. Hacker News (for the tech/analytical angle)
6. FIRE-focused blogs (Mad Fientist, Physician on FIRE, etc.)

### Content as Distribution
The tool's outputs generate compelling content:
- "I modeled Roth conversion strategies for a software engineer leaving for a startup — here's what I found"
- "Why converting $48K beats converting $100K: the bracket math"
- "How one sabbatical year could save you $18K in lifetime taxes"

---

## 8. Phased Roadmap

### Phase 1 — MVP: Demo-First Experience (Weeks 1–9)
The MVP is not a blank calculator waiting for inputs. It's a **demo-first experience** that immediately shows value through a worked example, then invites users to run their own scenario, then collects feedback and emails.

**Demo Persona: Alex**
Alex is 38, a senior software engineer who was earning $145K/year. He left his job 6 months ago to co-found a startup. Over 14 years of working, he accumulated $210,000 in a traditional 401k rollover IRA. His current year income is ~$35K (first few months before leaving). Filing single. Expects minimal income for 1-2 years while the startup gets off the ground.

This persona was chosen over an MBA student because: the balance is larger ($210K), making the optimizer's value more dramatic; the "startup founder / career break" framing resonates with a broader audience; the person is mid-career, which most users can relate to.

**1a. The Demo Scenario (The Hero Experience)**
Pre-populated results rendered with a two-tier hierarchy:
- **Primary view:** Headline tax savings, bracket fill visualization, point-in-time balance comparison at key ages (today / retirement / end of retirement — "with conversion" vs "without"), scenario comparison cards
- **Secondary view (scroll down):** Impact on after-tax wealth curve across all conversion amounts, year-by-year balance projections

Interactive guided walkthrough (animated in-product tour) + video version (60-90 second screen recording for sharing).

**1b. AI Conversation Demo**
Live AI conversation where users ask questions about Alex's scenario. Pre-seeded suggested question chips. AI can re-run the optimizer with modified inputs.

**1c. "Your Turn" Flow**
Stepped input form (3 screens, filing status conditional for Single/MFJ, smart defaults). Produces the same quality output as the demo.

**1d. Feedback, Email & Pricing Signal Collection**
Sequenced: personalized results → email capture ("Join waitlist + 3 months free") → optional 3-question survey → behavioral pricing test (Stripe early-bird reservation, activated when traffic supports it).

**Configurable inputs in M1:** Filing status, current year income (+ spouse for MFJ), traditional IRA balance, Roth IRA balance, expected future income, years until normal income, retirement age (default 65), years in retirement (default 20), annual retirement spending (default 4% rule), growth rate (default 7%), discount rate (default 5%).

**Simplifying assumptions in M1 (noted transparently in UI):**
- Single-year conversion only (multi-year is M2)
- Full liquidation at end of retirement (no estate planning / generational wealth transfer)
- Federal tax only (no state tax)
- No ACA subsidy modeling (M2)
- MFJ modeled as one spouse's IRA + joint household income (not dual IRA optimization)

### Phase 2 — Multi-Year Optimizer (Weeks 10–17)
Extend the engine to multi-year optimization using scipy.optimize. User specifies N years of varying income; tool finds the optimal conversion schedule across all years. Add ACA subsidy modeling. This is the paid feature and the competitive moat.

### Phase 3 — Monetization & Growth (Weeks 18–24)
Add accounts/auth, payment integration (Stripe), saved scenarios, PDF export. Implement the pricing model validated by Phase 1 behavioral testing. Add more demo personas (early retiree, sabbatical). This is where the product starts generating revenue.

### Phase 4 — Expand (Future)
State taxes, IRMAA, Social Security timing, capital gains interaction, estate planning / generational wealth transfer, additional life-transition modules per the broader vision. Only if Phases 1–3 validate demand.

---

## 9. Decisions Made

These decisions were made during the planning process and are now locked for M1.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Product name | Lucerna (getlucerna.com) | Latin for lamp/light — "see your financial future clearly." Accommodates broader vision |
| Frontend | Next.js + TypeScript + Tailwind → Vercel | Industry standard, strong React ecosystem, free hosting tier |
| Backend | Python + FastAPI + Pydantic → Railway | scipy/numpy for M2 optimizer, Pydantic typing, auto-docs |
| Repo structure | Monorepo (frontend/ + backend/) | Single repo, separate CI/CD per service |
| AI provider | Anthropic Claude Sonnet | Fast, affordable, tool use support |
| Charts | ApexCharts + custom SVG for bracket viz | ApexCharts has modern defaults and built-in animations; custom SVG for the non-standard bracket fill |
| Filing status (M1) | Single + MFJ (simplified) | One spouse's IRA, joint household income adjusts brackets. Minimal added complexity, covers majority of users |
| Demo persona | Alex, 38, SWE, $145K → startup, $210K trad IRA, $35K current income | Broadly relatable, mid-career, substantial balance = dramatic results |
| User-facing terminology | "After-tax wealth" and "lifetime tax savings" — never "NPV" | Plain English, avoids confusing users about what the number represents |
| Results hierarchy | Point-in-time balances primary, after-tax wealth curve secondary | Most users understand balances at specific ages; analytical users can drill into the curve |
| Estate planning | Out of scope for M1 (full liquidation assumption) | Noted transparently in UI; future expansion that would further favor Roth |
| Mobile | Required from day one, not a polish task | Many users arrive from Reddit on phones |
| Retirement years | User-configurable (default 20) | FIRE retirees may need 40+ years; someone at 60 might want 25 |
| Pricing approach | Behavioral (Stripe early-bird reservations), not stated-preference surveys | People lie about willingness to pay; card-on-file is revealed preference |

---

## 10. Open Questions (Remaining)

### Product
- [ ] How to handle the 5-year rule for early conversion access in the model
- [ ] Whether the AI conversation should be full chat or chat + inline annotations on the results
- [ ] Exact query limit per session for AI (10? 15? 20?)

### Business
- [ ] Exact pricing (validated by behavioral test data)
- [ ] Whether to pursue B2B (advisor tools) in addition to B2C
- [ ] Whether to offer a one-time purchase option alongside subscription

### Legal
- [ ] Legal review of AI response framing ($1K–$3K budget)
- [ ] Draft terms of service and privacy policy
- [ ] Confirm state-specific regulatory considerations

### Technical
- [ ] Algorithm choice for M2 multi-year optimization (scipy SLSQP vs. other constrained nonlinear solvers)
- [ ] AI inference cost modeling at scale
- [ ] Whether to add Framer Motion for UI micro-interactions or stay with CSS transitions + ApexCharts animations for M1

---

## 11. Personal Story (For Marketing)

*[To be filled in]* — The founder's experience using the original Excel tool. What scenario did the optimizer solve? What was the actual decision? What was the outcome? This story is marketing gold for landing pages and community posts.

---

## 12. Reference Materials

- Original Excel tool: Roth_Conversion_Optimizer.xlsx (uses Excel Solver GRG Nonlinear with ~10 constraints)
- Market research report: See companion document from earlier research session
- Key competitive tools to study: Pralana Online, MaxiFi, Boldin, ProjectionLab
- Key community threads: Bogleheads "Calculators for optimal Roth conversion size and timing," "Best Roth Conversion Analysis Tools," "Tools for optimizing Roth conversions?"
- Design inspiration: ProjectionLab (clean financial UI), Vercel/Stripe (sharp modern aesthetic), Wealthfront Path (guided input flow)
- Tax reference: IRS Revenue Procedure 2024-40 (2025 brackets), IRS Uniform Lifetime Table for RMDs
