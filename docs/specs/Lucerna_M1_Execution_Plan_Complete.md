# Lucerna — Milestone 1 Complete Execution Plan

**Product:** Lucerna (getlucerna.com)
**Tagline:** See your financial future clearly
**Last updated:** March 17, 2026

---

## Decision Log (All Locked)

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| D1 | Frontend framework | Next.js 14+ (App Router) + TypeScript + Tailwind | Industry standard, Vercel-native, strong React ecosystem |
| D2 | Backend framework | Python + FastAPI + Pydantic | scipy/numpy access for M2 optimizer, strong typing, auto-docs |
| D3 | Repo structure | Monorepo (frontend/ + backend/) | Single repo, separate CI/CD per service |
| D4 | Frontend hosting | Vercel | Made for Next.js, free tier, auto CI/CD |
| D5 | Backend hosting | Railway | Simple GitHub deploys, $5/mo hobby plan, no aggressive cold starts |
| D6 | AI provider | Anthropic Claude Sonnet | Fast, affordable, tool use support, familiar ecosystem |
| D7 | Charts | ApexCharts (standard charts) + Custom SVG (bracket viz) | ApexCharts has modern defaults and built-in animations; custom SVG for bracket fill which is non-standard |
| D8 | Email | Resend + database (Supabase or Railway Postgres) | Modern email API + simple storage |
| D9 | Analytics | PostHog (free tier) | Event tracking, funnels, session recording, privacy-friendly |
| D10 | Guided tour | Custom implementation (React state + CSS transitions) | Full control over mobile behavior and animation |
| D11 | Domain | getlucerna.com | Clean, available, accommodates broader vision |
| D12 | Filing status | Single + MFJ (simplified: one spouse's IRA, joint household income) | Covers majority of users with minimal added complexity |
| D13 | Demo persona | Alex, 38, senior SWE ($145K), left for startup, $210K trad IRA, $35K current income | Broadly relatable, mid-career, substantial balance = dramatic results |
| D14 | User-facing terminology | "After-tax wealth" and "lifetime tax savings" — never "NPV" | Plain English, avoids confusion about what the number represents |
| D15 | Results hierarchy | Point-in-time balances primary, NPV curve secondary | Most users understand balances at ages; analytical users can drill into curve |
| D16 | Estate planning | Out of scope M1 (full liquidation assumption, noted in UI) | Future expansion; would further favor Roth |
| D17 | Configurable retirement | Years in retirement is user-configurable (default 20) | FIRE retirees may need 40+ years; someone at 60 might want 25 |

---

## Architecture Overview

```
getlucerna.com
├── frontend/ (Next.js + TypeScript + Tailwind)  → Vercel
│   ├── Landing page / hero
│   ├── Demo scenario (pre-populated results)
│   ├── Guided walkthrough (animated tour)
│   ├── Bracket visualization (custom SVG)
│   ├── Results summary
│   ├── Input form (stepped, 3 screens)
│   ├── AI chat UI (streaming)
│   ├── Email capture + survey
│   └── Calls backend API for:
│       ├── /api/optimize (run engine)
│       ├── /api/chat (AI conversation)
│       ├── /api/email (capture)
│       └── /api/feedback (survey)
│
├── backend/ (Python + FastAPI)  → Railway
│   ├── app/
│   │   ├── engine/
│   │   │   ├── types.py (Pydantic models)
│   │   │   ├── tax.py (bracket calculator)
│   │   │   ├── optimizer.py (NPV + sweep)
│   │   │   ├── trace.py (reasoning trace)
│   │   │   └── demo.py (Alex scenario fixture)
│   │   ├── api/
│   │   │   ├── optimize.py (POST /api/optimize)
│   │   │   ├── chat.py (POST /api/chat)
│   │   │   ├── email.py (POST /api/email)
│   │   │   └── feedback.py (POST /api/feedback)
│   │   ├── ai/
│   │   │   ├── system_prompt.py
│   │   │   └── tools.py (function calling definitions)
│   │   └── main.py (FastAPI app, CORS, startup)
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile (for Railway)
│
└── README.md
```

---

## Dependency Map & Parallelization

```
WEEK 1-2: FOUNDATION
  WS1 (Infrastructure)  ─────────────────┐
  WS2 (Engine)          ─────────────────┤── All parallel
  WS7.1-7.3 (Copy/Legal writing) ────────┘

WEEK 3-5: CORE EXPERIENCE
  WS3 (Frontend UI)     ─────────────────┐── Partially parallel
  WS4 (AI Layer)        ─────────────────┘   (different components, same design system)
  │
  Both depend on: WS1 complete + WS2 engine validated

WEEK 6-7: GUIDED EXPERIENCE + FEEDBACK
  WS5 (Walkthrough)     ── Depends on WS3 + WS4 (UI must exist)
  WS6 (Email/Feedback)  ── Backend can start Week 5; UI needs WS3

WEEK 8-9: LAUNCH
  WS7.4-7.7 (SEO, QA, Launch posts) ── Depends on everything
```

### Critical Path:
WS2 (engine validated) → WS3.3 (bracket viz) → WS4 (AI + trace) → WS5 (tour) → WS5.4 (video) → WS7.5 (launch)

---

## WS1: Infrastructure & Project Setup

**Goal:** Monorepo with frontend and backend running locally and deployed, with all external services connected.

### WS1.1: Register Domain
```
1. Go to namecheap.com (or registrar of choice)
2. Search for getlucerna.com
3. Register (~$10/year)
4. Don't configure DNS yet — will point to Vercel after deployment
```
**Time:** 15 min | **Depends on:** Nothing | **Blocks:** DNS config (WS1.6)

---

### WS1.2: Create GitHub Repository
```
1. Go to github.com → New Repository
2. Name: lucerna
3. Visibility: Private
4. Initialize with: README.md, .gitignore (Node), MIT License
5. Clone locally:
   git clone https://github.com/[username]/lucerna.git
   cd lucerna
6. Create monorepo folder structure:
   mkdir frontend backend
```

**README.md:**
```markdown
# Lucerna

See your financial future clearly.

A multi-year Roth conversion optimizer that helps people in income transitions
make tax-smart decisions — with AI-powered explanations.

## Architecture
- `frontend/` — Next.js + TypeScript + Tailwind (deployed to Vercel)
- `backend/` — Python + FastAPI (deployed to Railway)

## Status
Milestone 1: In development
```
**Time:** 15 min | **Depends on:** Nothing | **Blocks:** Everything

---

### WS1.3: Initialize Frontend (Next.js)
```bash
cd frontend/

# Create Next.js project
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
# Prompts: Yes to all (TypeScript, ESLint, Tailwind, src/ dir, App Router)

# Verify it runs
npm run dev
# → http://localhost:3000 should show Next.js welcome

# Install dependencies
npm install framer-motion           # animations (tour transitions, UI micro-interactions)
npm install apexcharts              # charting library (NPV curve, comparison charts)
npm install react-apexcharts        # React wrapper for ApexCharts
npm install lucide-react            # icon set
npm install zod                     # form validation

# Dev dependencies
npm install -D @types/node prettier

# Create folder structure
mkdir -p src/components/ui
mkdir -p src/components/demo
mkdir -p src/components/calculator
mkdir -p src/components/chat
mkdir -p src/components/feedback
mkdir -p src/components/tour
mkdir -p src/lib/api          # frontend API client (calls backend)
mkdir -p src/lib/types        # shared TypeScript types
mkdir -p src/lib/utils        # formatting, constants

# Create env file for local dev
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF

# Commit
cd ..
git add .
git commit -m "Initialize Next.js frontend with TypeScript, Tailwind, project structure"
git push origin main
```

**Create frontend API client stub:**
```typescript
// frontend/src/lib/api/client.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function optimizeScenario(input: any) {
  const res = await fetch(`${API_BASE}/api/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function chatMessage(message: string, scenarioId: string, history: any[]) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, scenario_id: scenarioId, history }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function submitEmail(email: string, scenarioData?: any) {
  const res = await fetch(`${API_BASE}/api/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, scenario_data: scenarioData }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function submitFeedback(feedback: any) {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

**Time:** 1.5 hours | **Depends on:** WS1.2 | **Blocks:** All frontend work

---

### WS1.4: Initialize Backend (FastAPI)
```bash
cd backend/

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Create requirements.txt
cat > requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.9.0
anthropic==0.39.0
python-dotenv==1.0.1
resend==2.5.0
httpx==0.27.0
numpy==1.26.4
EOF

# Install dependencies
pip install -r requirements.txt

# Create folder structure
mkdir -p app/engine
mkdir -p app/api
mkdir -p app/ai
mkdir -p tests

# Create main FastAPI app
cat > app/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Lucerna API",
    description="Roth conversion optimization engine + AI explanation layer",
    version="0.1.0",
)

# CORS — allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",        # local dev
        "https://getlucerna.com",       # production
        "https://*.vercel.app",         # Vercel preview deploys
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "lucerna-api"}

# Import and include route modules
# (will be added as we build each endpoint)
# from app.api.optimize import router as optimize_router
# from app.api.chat import router as chat_router
# from app.api.email import router as email_router
# from app.api.feedback import router as feedback_router
# app.include_router(optimize_router, prefix="/api")
# app.include_router(chat_router, prefix="/api")
# app.include_router(email_router, prefix="/api")
# app.include_router(feedback_router, prefix="/api")
PYEOF

# Create .env file for local dev
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-XXXXXXXXXXXXXXXX
RESEND_API_KEY=re_XXXXXXXXXXXXXXXX
DATABASE_URL=sqlite:///./lucerna.db
EOF

# Add .env to .gitignore
cat > .gitignore << 'EOF'
venv/
__pycache__/
*.pyc
.env
.pytest_cache/
EOF

# Test that it runs
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs should show FastAPI auto-docs
# → http://localhost:8000/health should return {"status": "ok"}

# Create Dockerfile for Railway deployment
cat > Dockerfile << 'PYEOF'
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
PYEOF

# Commit
cd ..
git add .
git commit -m "Initialize FastAPI backend with project structure, CORS, health check"
git push origin main
```

**Time:** 2 hours | **Depends on:** WS1.2 | **Blocks:** All backend work

---

### WS1.5: Deploy Frontend to Vercel
```
1. Go to vercel.com → Sign up with GitHub
2. Click "Add New Project" → Import lucerna repo
3. IMPORTANT: Set "Root Directory" to "frontend/"
4. Framework Preset: Next.js (auto-detected)
5. Click Deploy
6. Note URL: lucerna-XXXX.vercel.app

Configure custom domain:
1. Vercel dashboard → Project Settings → Domains
2. Add: getlucerna.com
3. Add DNS records at your registrar:
   - CNAME record: @ → cname.vercel-dns.com
   - Or A record: @ → 76.76.21.21
4. SSL is automatic

Add environment variables:
1. Vercel → Project Settings → Environment Variables
2. Add: NEXT_PUBLIC_API_URL = https://[your-railway-url] (add after WS1.6)
```
**Time:** 30 min | **Depends on:** WS1.1, WS1.3 | **Blocks:** Sharing the URL

---

### WS1.6: Deploy Backend to Railway
```
1. Go to railway.app → Sign up with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select lucerna repo
4. IMPORTANT: Set "Root Directory" to "backend/"
5. Railway should auto-detect Dockerfile
6. Set environment variables:
   - ANTHROPIC_API_KEY = sk-ant-XXXXXXXX
   - RESEND_API_KEY = re_XXXXXXXX
   - PORT = 8000
7. Deploy
8. Note the generated URL: lucerna-api-production-XXXX.up.railway.app
9. Test: curl https://[railway-url]/health → {"status": "ok"}

10. Go back to Vercel and update:
    NEXT_PUBLIC_API_URL = https://[railway-url]
```
**Time:** 45 min | **Depends on:** WS1.4 | **Blocks:** Frontend-backend integration

---

### WS1.7: Set Up Anthropic API Access
```
1. Go to console.anthropic.com → Sign up / Log in
2. API Keys → Create new key → Name: "lucerna-production"
3. Copy key (shown only once)
4. Add to Railway env vars (WS1.6)
5. Add to backend/.env (local dev)
6. Set billing alert: $50/month limit, alerts at 50% and 80%
7. Test connection (see test script in WS4.1)
```
**Time:** 15 min | **Depends on:** Nothing | **Blocks:** WS4

---

### WS1.8: Set Up PostHog Analytics
```
1. Go to posthog.com → Sign up (free tier)
2. Create project: "Lucerna"
3. Get project API key and host URL
4. Install in frontend:
   npm install posthog-js
5. Initialize in frontend/src/app/layout.tsx (or a providers component)
6. Add to Vercel env vars:
   NEXT_PUBLIC_POSTHOG_KEY = phc_XXXXXXXX
   NEXT_PUBLIC_POSTHOG_HOST = https://us.i.posthog.com
```
**Time:** 30 min | **Depends on:** WS1.3 | **Blocks:** WS6 (analytics events)

---

**WS1 Total: ~6 hours**

---

## WS2: Optimization Engine (Python)

**Goal:** A validated, deterministic optimization engine that produces correct results and a structured reasoning trace. Validated against the Excel model.

### WS2.1: Define Pydantic Models (Input/Output Schema)

```python
# backend/app/engine/types.py

from pydantic import BaseModel, Field
from typing import Literal, Optional
from enum import Enum


class FilingStatus(str, Enum):
    SINGLE = "single"
    MFJ = "married_filing_jointly"


class ScenarioInput(BaseModel):
    """All inputs needed to run the optimization."""
    
    # Personal
    age: int = Field(ge=18, le=80, description="Current age")
    filing_status: FilingStatus
    
    # Current year income
    current_year_income: float = Field(ge=0, description="W-2/1099 income for conversion year")
    spouse_income: float = Field(
        default=0, ge=0,
        description="Spouse income (MFJ only). Ignored for single filers."
    )
    
    # Retirement accounts
    traditional_ira_balance: float = Field(ge=0, description="Traditional IRA + rollover 401k balance")
    roth_ira_balance: float = Field(default=0, ge=0, description="Existing Roth IRA balance")
    
    # Future assumptions
    future_annual_income: float = Field(ge=0, description="Expected income after low-income period")
    years_until_normal_income: int = Field(ge=1, le=10, description="Years until income returns to normal")
    
    # Retirement assumptions (with defaults)
    retirement_age: int = Field(default=65, ge=30, le=80)
    years_in_retirement: int = Field(default=20, ge=5, le=40)
    annual_retirement_spending: Optional[float] = Field(
        default=None,
        description="If not provided, defaults to 4% rule on total balance"
    )
    
    # Growth/discount rates (with defaults)
    annual_growth_rate: float = Field(default=0.07, ge=0.0, le=0.20)
    discount_rate: float = Field(default=0.05, ge=0.0, le=0.15)


class BracketFillResult(BaseModel):
    """How a single tax bracket is filled by income and conversion."""
    bracket_rate: float
    bracket_min: float
    bracket_max: float
    bracket_capacity: float
    filled_by_income: float
    filled_by_conversion: float
    remaining_capacity: float
    tax_in_bracket: float


class ScenarioComparison(BaseModel):
    """A single scenario for comparison (no conversion, optimal, full, etc.)."""
    label: str
    conversion_amount: float
    npv: float
    tax_on_conversion: float
    difference_from_optimal: float


class ReasoningTrace(BaseModel):
    """Structured explanation of WHY the optimal amount is what it is.
    This feeds the AI explanation layer."""
    
    binding_constraint: str
    marginal_tax_rate_at_optimal: float
    marginal_benefit_at_optimal: float
    
    cost_of_next_bracket: dict  # bracketRate, additionalTax, netEffect
    benefit_of_current_bracket: dict  # bracketRate, taxPaid, futureTaxAvoided
    
    sensitivity_notes: list[str]
    
    summary_points: dict  # whatToConvert, whyThisAmount, howMuchYouSave, keyTradeoff


class NPVCurvePoint(BaseModel):
    conversion_amount: float
    npv: float


class OptimizationResult(BaseModel):
    """Complete output from the optimizer."""
    
    # The answer
    optimal_conversion_amount: float
    
    # Key metrics
    tax_on_conversion: float
    effective_tax_rate_on_conversion: float
    estimated_lifetime_tax_savings: float
    npv_at_optimal: float
    npv_at_zero: float
    npv_at_full_conversion: float
    
    # Bracket visualization data
    bracket_fill_analysis: list[BracketFillResult]
    
    # Scenario comparisons
    scenarios: list[ScenarioComparison]
    
    # AI explanation data
    reasoning_trace: ReasoningTrace
    
    # Full NPV curve for charting
    npv_curve: list[NPVCurvePoint]
    
    # Input echo (so frontend doesn't need to track separately)
    input: ScenarioInput
```

**Time:** 2 hours | **Depends on:** WS1.4 | **Blocks:** WS2.2–2.6

---

### WS2.2: Implement Federal Tax Bracket Calculator

```python
# backend/app/engine/tax.py

from app.engine.types import FilingStatus, BracketFillResult

# ==============================================
# 2025 Federal Tax Brackets
# Source: IRS Revenue Procedure 2024-40
# TODO: Verify exact thresholds against IRS publication
# ==============================================

BRACKETS = {
    FilingStatus.SINGLE: [
        {"min": 0, "max": 11925, "rate": 0.10},
        {"min": 11925, "max": 48475, "rate": 0.12},
        {"min": 48475, "max": 103350, "rate": 0.22},
        {"min": 103350, "max": 197300, "rate": 0.24},
        {"min": 197300, "max": 250525, "rate": 0.32},
        {"min": 250525, "max": 626350, "rate": 0.35},
        {"min": 626350, "max": float("inf"), "rate": 0.37},
    ],
    FilingStatus.MFJ: [
        {"min": 0, "max": 23850, "rate": 0.10},
        {"min": 23850, "max": 96950, "rate": 0.12},
        {"min": 96950, "max": 206700, "rate": 0.22},
        {"min": 206700, "max": 394600, "rate": 0.24},
        {"min": 394600, "max": 501050, "rate": 0.32},
        {"min": 501050, "max": 751600, "rate": 0.35},
        {"min": 751600, "max": float("inf"), "rate": 0.37},
    ],
}

STANDARD_DEDUCTION = {
    FilingStatus.SINGLE: 15000,   # TODO: verify exact 2025 amount
    FilingStatus.MFJ: 30000,      # TODO: verify exact 2025 amount
}


def calculate_federal_tax(
    gross_income: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> float:
    """Calculate federal income tax using progressive brackets."""
    deduction = STANDARD_DEDUCTION[filing_status]
    taxable_income = max(0, gross_income - deduction)
    brackets = BRACKETS[filing_status]
    
    tax = 0.0
    for bracket in brackets:
        if taxable_income <= bracket["min"]:
            break
        taxable_in_bracket = min(taxable_income, bracket["max"]) - bracket["min"]
        tax += taxable_in_bracket * bracket["rate"]
    
    return tax


def get_marginal_rate(
    gross_income: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> float:
    """Get the marginal tax rate at a given income level."""
    deduction = STANDARD_DEDUCTION[filing_status]
    taxable_income = max(0, gross_income - deduction)
    brackets = BRACKETS[filing_status]
    
    for bracket in brackets:
        if taxable_income >= bracket["min"] and taxable_income < bracket["max"]:
            return bracket["rate"]
    
    return brackets[-1]["rate"]


def analyze_bracket_fill(
    base_income: float,
    conversion_amount: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> list[BracketFillResult]:
    """Generate bracket fill analysis for the bracket visualization."""
    deduction = STANDARD_DEDUCTION[filing_status]
    base_taxable = max(0, base_income - deduction)
    total_taxable = max(0, base_income + conversion_amount - deduction)
    brackets = BRACKETS[filing_status]
    
    results = []
    for bracket in brackets:
        capacity = bracket["max"] - bracket["min"]
        if bracket["max"] == float("inf"):
            capacity = bracket["min"] + 500000 - bracket["min"]  # cap for display
        
        filled_by_income = max(0, min(base_taxable, bracket["max"]) - bracket["min"])
        total_filled = max(0, min(total_taxable, bracket["max"]) - bracket["min"])
        filled_by_conversion = total_filled - filled_by_income
        remaining = max(0, capacity - total_filled)
        tax_in_bracket = total_filled * bracket["rate"]
        
        display_max = bracket["max"] if bracket["max"] != float("inf") else bracket["min"] + 500000
        
        results.append(BracketFillResult(
            bracket_rate=bracket["rate"],
            bracket_min=bracket["min"],
            bracket_max=display_max,
            bracket_capacity=capacity,
            filled_by_income=filled_by_income,
            filled_by_conversion=filled_by_conversion,
            remaining_capacity=remaining,
            tax_in_bracket=tax_in_bracket,
        ))
        
        if total_taxable < bracket["max"]:
            break
    
    return results
```

**Tests:**
```python
# backend/tests/test_tax.py

import pytest
from app.engine.tax import calculate_federal_tax, get_marginal_rate, analyze_bracket_fill
from app.engine.types import FilingStatus


class TestCalculateFederalTax:
    def test_zero_income(self):
        assert calculate_federal_tax(0) == 0
    
    def test_below_standard_deduction(self):
        assert calculate_federal_tax(10000) == 0
    
    def test_single_in_10_percent_only(self):
        # $20K income - $15K deduction = $5K taxable → $5K * 10% = $500
        tax = calculate_federal_tax(20000)
        assert abs(tax - 500) < 1
    
    def test_single_spanning_10_and_12(self):
        # $50K - $15K = $35K taxable
        # $11,925 * 10% = $1,192.50
        # ($35K - $11,925) * 12% = $2,769
        # Total: $3,961.50
        tax = calculate_federal_tax(50000)
        assert abs(tax - 3961.50) < 1
    
    def test_mfj_wider_brackets(self):
        # MFJ: $50K - $30K deduction = $20K taxable
        # All in 10% bracket (which goes to $23,850 for MFJ)
        # $20K * 10% = $2,000
        tax = calculate_federal_tax(50000, FilingStatus.MFJ)
        assert abs(tax - 2000) < 1
    
    def test_mfj_with_spouse_income_concept(self):
        # MFJ $100K combined - $30K deduction = $70K taxable
        # $23,850 * 10% = $2,385
        # ($70K - $23,850) * 12% = $5,538
        # Total: $7,923
        tax = calculate_federal_tax(100000, FilingStatus.MFJ)
        assert abs(tax - 7923) < 1

    # TODO: Add tests at each bracket boundary
    # TODO: Add tests that match Excel model values


class TestBracketFill:
    def test_conversion_fills_brackets(self):
        results = analyze_bracket_fill(20000, 40000, FilingStatus.SINGLE)
        # $20K income fills some of 10% bracket
        # $40K conversion should spill into 12% bracket
        assert len(results) >= 2
        assert results[0].filled_by_income > 0
        assert results[0].filled_by_conversion >= 0
        assert results[1].filled_by_conversion > 0
```

```bash
# Run tests
cd backend
pip install pytest
python -m pytest tests/ -v
```

**Time:** 3 hours | **Depends on:** WS2.1 | **Blocks:** WS2.3, WS3.3

---

### WS2.3: Implement Roth Conversion NPV Model + Optimizer

This is the core financial model — a port of the Excel logic to Python.

```python
# backend/app/engine/optimizer.py

from app.engine.types import (
    ScenarioInput, OptimizationResult, ScenarioComparison,
    NPVCurvePoint, FilingStatus
)
from app.engine.tax import calculate_federal_tax, analyze_bracket_fill
from app.engine.trace import generate_reasoning_trace


def calculate_npv(input: ScenarioInput, conversion_amount: float) -> float:
    """
    Calculate NPV for a given conversion amount.
    
    Model:
    - Year 0: Conversion. Pay tax on converted amount from non-retirement assets.
    - Years 1 to retirement: Growth, no withdrawals.
    - Retirement years: Annual distributions from traditional, Roth grows tax-free.
    - Liquidation: Remaining balances distributed.
    """
    actual_conversion = min(max(0, conversion_amount), input.traditional_ira_balance)
    
    # Combined household income for tax calculation
    household_income = input.current_year_income + input.spouse_income
    
    # Year 0: Tax impact
    total_income_year0 = household_income + actual_conversion
    tax_year0 = calculate_federal_tax(total_income_year0, input.filing_status)
    tax_without_conversion = calculate_federal_tax(household_income, input.filing_status)
    tax_on_conversion = tax_year0 - tax_without_conversion
    
    # Post-conversion balances
    trad_balance = input.traditional_ira_balance - actual_conversion
    roth_balance = input.roth_ira_balance + actual_conversion
    
    # NPV starts with the tax cost
    npv = -tax_on_conversion
    
    # Growth years (until retirement)
    years_until_retirement = input.retirement_age - input.age
    g = input.annual_growth_rate
    d = input.discount_rate
    
    for year in range(1, years_until_retirement + 1):
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)
    
    # Retirement distributions
    spending = input.annual_retirement_spending
    if spending is None:
        total_balance = trad_balance + roth_balance
        spending = total_balance * 0.04  # 4% rule default
    
    for year in range(years_until_retirement + 1,
                      years_until_retirement + input.years_in_retirement + 1):
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)
        
        distribution = min(spending, trad_balance)
        trad_balance -= distribution
        
        tax_on_dist = calculate_federal_tax(distribution, input.filing_status)
        after_tax_dist = distribution - tax_on_dist
        
        discount_factor = (1 + d) ** (-year)
        npv += after_tax_dist * discount_factor
    
    # Liquidation
    liquidation_year = years_until_retirement + input.years_in_retirement + 1
    discount_factor = (1 + d) ** (-liquidation_year)
    
    if trad_balance > 0:
        tax_on_liquidation = calculate_federal_tax(trad_balance, input.filing_status)
        npv += (trad_balance - tax_on_liquidation) * discount_factor
    
    npv += roth_balance * discount_factor
    
    return npv


def optimize(input: ScenarioInput) -> OptimizationResult:
    """Find the optimal conversion amount by sweeping all possibilities."""
    max_conversion = input.traditional_ira_balance
    
    # Coarse sweep
    num_points = 1000
    step = max(100, max_conversion / num_points)
    
    npv_curve: list[NPVCurvePoint] = []
    best_amount = 0.0
    best_npv = float("-inf")
    
    amount = 0.0
    while amount <= max_conversion:
        npv = calculate_npv(input, amount)
        npv_curve.append(NPVCurvePoint(conversion_amount=amount, npv=npv))
        if npv > best_npv:
            best_npv = npv
            best_amount = amount
        amount += step
    
    # Include exact max
    npv_at_max = calculate_npv(input, max_conversion)
    npv_curve.append(NPVCurvePoint(conversion_amount=max_conversion, npv=npv_at_max))
    if npv_at_max > best_npv:
        best_npv = npv_at_max
        best_amount = max_conversion
    
    # Fine sweep around best
    fine_start = max(0, best_amount - step)
    fine_end = min(max_conversion, best_amount + step)
    fine_step = 100
    amount = fine_start
    while amount <= fine_end:
        npv = calculate_npv(input, amount)
        if npv > best_npv:
            best_npv = npv
            best_amount = amount
        amount += fine_step
    
    # Round to nearest $100
    best_amount = round(best_amount / 100) * 100
    best_npv = calculate_npv(input, best_amount)
    
    # Comparison scenarios
    npv_at_zero = calculate_npv(input, 0)
    npv_at_full = calculate_npv(input, max_conversion)
    household_income = input.current_year_income + input.spouse_income
    
    tax_on_conversion = (
        calculate_federal_tax(household_income + best_amount, input.filing_status)
        - calculate_federal_tax(household_income, input.filing_status)
    )
    
    bracket_fill = analyze_bracket_fill(household_income, best_amount, input.filing_status)
    
    scenarios = [
        ScenarioComparison(
            label="No conversion",
            conversion_amount=0,
            npv=npv_at_zero,
            tax_on_conversion=0,
            difference_from_optimal=npv_at_zero - best_npv,
        ),
        ScenarioComparison(
            label="Optimal conversion",
            conversion_amount=best_amount,
            npv=best_npv,
            tax_on_conversion=tax_on_conversion,
            difference_from_optimal=0,
        ),
        ScenarioComparison(
            label="Full conversion",
            conversion_amount=max_conversion,
            npv=npv_at_full,
            tax_on_conversion=(
                calculate_federal_tax(household_income + max_conversion, input.filing_status)
                - calculate_federal_tax(household_income, input.filing_status)
            ),
            difference_from_optimal=npv_at_full - best_npv,
        ),
    ]
    
    reasoning = generate_reasoning_trace(input, best_amount, bracket_fill, npv_curve)
    
    return OptimizationResult(
        optimal_conversion_amount=best_amount,
        tax_on_conversion=tax_on_conversion,
        effective_tax_rate_on_conversion=(
            tax_on_conversion / best_amount if best_amount > 0 else 0
        ),
        estimated_lifetime_tax_savings=best_npv - npv_at_zero,
        npv_at_optimal=best_npv,
        npv_at_zero=npv_at_zero,
        npv_at_full_conversion=npv_at_full,
        bracket_fill_analysis=bracket_fill,
        scenarios=scenarios,
        reasoning_trace=reasoning,
        npv_curve=npv_curve,
        input=input,
    )
```

**Time:** 5 hours | **Depends on:** WS2.1, WS2.2 | **Blocks:** WS2.4, WS2.5

---

### WS2.4: Implement Reasoning Trace Generator

```python
# backend/app/engine/trace.py
# (Full implementation as described in the earlier execution plan,
#  adapted to Python/Pydantic. See WS2.5 in original plan for logic.)
#
# Key outputs:
# - binding_constraint: "Top of 12% bracket"
# - summary_points.what_to_convert: "Convert $47,200 this year"
# - summary_points.why_this_amount: "Fills your 12% bracket without entering 22%"
# - summary_points.how_much_you_save: "Estimated $12,400 in lifetime tax savings"
# - summary_points.key_tradeoff: "Converting more costs 22¢/dollar..."
# - sensitivity_notes: ["Sensitive to growth rate assumption"]
```

**Time:** 4 hours | **Depends on:** WS2.3 | **Blocks:** WS4.2 (AI system prompt)

---

### WS2.5: Validate Against Excel Model

**CRITICAL QUALITY GATE. Do not proceed to UI until this passes.**

```python
# backend/tests/test_validation.py

import pytest
from app.engine.optimizer import optimize
from app.engine.types import ScenarioInput, FilingStatus

# =====================================================
# Test cases from Excel model
# MUST BE FILLED IN by running the Excel tool with
# identical inputs and recording the outputs
# =====================================================

EXCEL_VALIDATION_CASES = [
    {
        "name": "Alex demo scenario",
        "input": ScenarioInput(
            age=38,
            filing_status=FilingStatus.SINGLE,
            current_year_income=35000,
            traditional_ira_balance=210000,
            roth_ira_balance=0,
            future_annual_income=145000,
            years_until_normal_income=2,
            retirement_age=65,
            years_in_retirement=20,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        ),
        "expected_optimal_range": (20000, 80000),  # Rough range — tighten after Excel validation
        "expected_savings_positive": True,
    },
    # TODO: Add 4-9 more cases with exact Excel values
    # - Low balance, low income
    # - High balance, zero income
    # - High balance, high income (conversion may not help)
    # - MFJ scenario
    # - Edge case: balance is zero
]

class TestExcelValidation:
    @pytest.mark.parametrize("case", EXCEL_VALIDATION_CASES, ids=lambda c: c["name"])
    def test_matches_excel(self, case):
        result = optimize(case["input"])
        
        low, high = case["expected_optimal_range"]
        assert low <= result.optimal_conversion_amount <= high, (
            f"Optimal {result.optimal_conversion_amount} outside expected range [{low}, {high}]"
        )
        
        if case["expected_savings_positive"]:
            assert result.estimated_lifetime_tax_savings > 0
```

**Time:** 3 hours | **Depends on:** WS2.3 | **Blocks:** ALL UI WORK

---

### WS2.6: Create Demo Scenario + API Endpoint

```python
# backend/app/engine/demo.py

from app.engine.types import ScenarioInput, FilingStatus

DEMO_SCENARIO = ScenarioInput(
    age=38,
    filing_status=FilingStatus.SINGLE,
    current_year_income=35000,
    spouse_income=0,
    traditional_ira_balance=210000,
    roth_ira_balance=5000,
    future_annual_income=145000,
    years_until_normal_income=2,
    retirement_age=65,
    years_in_retirement=20,
    annual_retirement_spending=80000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

DEMO_PERSONA = {
    "name": "Alex",
    "age": 38,
    "occupation": "Senior Software Engineer",
    "previous_salary": "$145,000/year",
    "situation": "Left job 6 months ago to co-found a startup",
    "current_income": "$35,000 (6 months of salary before leaving)",
    "ira_balance": "$210,000 (traditional 401k rollover from 14 years of work)",
    "outlook": "Expects minimal income for 1-2 years while startup gets off the ground",
    "filing_status": "Single",
}
```

```python
# backend/app/api/optimize.py

from fastapi import APIRouter
from app.engine.types import ScenarioInput, OptimizationResult
from app.engine.optimizer import optimize
from app.engine.demo import DEMO_SCENARIO, DEMO_PERSONA

router = APIRouter()

@router.post("/optimize", response_model=OptimizationResult)
async def run_optimization(input: ScenarioInput):
    """Run the optimizer for a given scenario."""
    return optimize(input)

@router.get("/demo")
async def get_demo():
    """Get the pre-computed demo scenario and results."""
    result = optimize(DEMO_SCENARIO)
    return {
        "persona": DEMO_PERSONA,
        "input": DEMO_SCENARIO,
        "result": result,
    }
```

**Time:** 2 hours | **Depends on:** WS2.3, WS2.5 | **Blocks:** WS3.6 (demo UI), WS5 (tour)

---

**WS2 Total: ~19 hours**

---

## WS3-WS7: Summary Scope (Detailed Breakdowns to Follow)

Given the length of this document, here is the scope summary for WS3-WS7. Each will be broken down to the same granularity as WS1-WS2 in follow-up execution plan documents.

### WS3: Frontend Core UI (~35 hours)
- 3.1: Tailwind design system config with bracket colors, mobile breakpoints, Inter font
- 3.2: Landing page / hero section (mobile-responsive from day one)
- 3.3: Bracket visualization component (custom SVG, animated with CSS transitions, adaptive layout — horizontal stacked bars on desktop, vertical stacked bars on mobile)
- 3.4: Results page — two-tier hierarchy:
  - **Primary view:** Headline tax savings metric, bracket fill visualization, point-in-time balance comparison at key ages (today / retirement / end of retirement) showing "with conversion vs. without," scenario comparison cards (no conversion / optimal / full conversion)
  - **Secondary view (scroll or toggle):** "Impact on after-tax wealth" curve across all conversion amounts (ApexCharts area chart), year-by-year balance projections, sensitivity analysis
  - **Terminology:** Never use "NPV." Use "estimated lifetime tax savings" for the headline, "impact on after-tax wealth (today's dollars)" for the curve, "projected balance" for point-in-time values
- 3.5: Stepped input form (3 screens, filing status conditional for Single/MFJ with adjusted labels, smart defaults for all assumption fields, configurable retirement years/spending/growth rate)
- 3.6: Demo scenario pre-populated view ("Meet Alex" — 38yo SWE, startup founder, $210K IRA, $35K income)
- 3.7: Cross-device QA (iPhone SE, iPhone 14/15, iPad, laptop, wide desktop)
- 3.8: Info tooltips for simplifying assumptions ("The model assumes all remaining balances are withdrawn at the end of this period. Estate planning and wealth transfer are not currently modeled.")

### WS4: AI Conversation Layer (~26 hours)
- 4.1: Anthropic SDK integration + test connection
- 4.2: System prompt design (scenario data + reasoning trace + legal framing: never "you should," always "the analysis shows")
- 4.3: FastAPI /api/chat endpoint (streaming, conversation history)
- 4.4: Chat UI component (streaming display, suggested question chips, mobile layout — separate scrollable section below results, not side-by-side)
- 4.5: Tool use — AI can re-run optimizer with modified inputs and explain the delta
- 4.6: Rate limiting (10-15 queries per session, graceful limit-reached message)
- 4.7: Prompt testing + refinement (20+ test questions including: "what point in time does this correspond to?", "should I do this?", "what about leaving money to my kids?", "what if my income changes?")

### WS5: Guided Walkthrough (~15 hours)
- 5.1: Custom tour framework (React state + CSS transitions, mobile-aware — simplified mobile tour or video fallback)
- 5.2: Tour step copy (8-10 steps, building to the "aha moment")
- 5.3: Tour animations (bracket chart fills progressively, metric counters animate up, key elements highlight in sequence)
- 5.4: Record walkthrough video (60-90 sec, screen recording + voiceover or text overlay)
- 5.5: Host and embed video (YouTube unlisted or direct hosting)

### WS6: Feedback & Email Collection (~15 hours)
- 6.1: Database setup (Railway Postgres or Supabase) for emails + feedback + scenario data
- 6.2: Resend integration for confirmation emails
- 6.3: FastAPI /api/email and /api/feedback endpoints
- 6.4: Email capture UI (post-results, "Join waitlist + 3 months free when we launch")
- 6.5: Survey UI (3 questions, optional, "Help us build this — 30 seconds": value signal open text, feature prioritization multi-select, open catch-all)
- 6.6: PostHog event tracking (funnel: landing → demo viewed → demo AI interaction → personal scenario started → personal scenario completed → email submitted → survey completed)
- 6.7: Thank you / confirmation state with social sharing prompt ("Know someone who'd find this useful?")

### WS7: Legal, Content & Launch (~18 hours)
- 7.1: Legal disclaimer page + inline disclaimers on results page + terms of use
- 7.2: Privacy policy (email collection, scenario data storage, PostHog analytics)
- 7.3: Landing page copy (headline, value prop, "how it works," brief vision statement for broader Lucerna direction)
- 7.4: Demo persona narrative ("Meet Alex" story copy — relatable, concrete, sets up the scenario)
- 7.5: SEO basics (meta tags, OpenGraph for social previews — crucial since links will be shared on Reddit/Twitter)
- 7.6: Draft launch posts (Reddit r/financialindependence, Bogleheads forum, Twitter/X thread — educational framing, not promotional)
- 7.7: QA / bug bash (full end-to-end flow on Chrome, Firefox, Safari; mobile + desktop)
- 7.8: Soft launch to 5-10 trusted people, fix critical issues
- 7.9: Public launch

---

## Total Estimate

| Workstream | Hours |
|-----------|-------|
| WS1: Infrastructure & Setup | 6 |
| WS2: Optimization Engine | 19 |
| WS3: Frontend Core UI (mobile-responsive) | 35 |
| WS4: AI Conversation Layer | 26 |
| WS5: Guided Walkthrough | 15 |
| WS6: Feedback & Email | 15 |
| WS7: Legal, Content & Launch | 18 |
| **Subtotal** | **134** |
| **Buffer (25%)** | **34** |
| **Total with buffer** | **168** |

**At 15 hrs/week: ~11 weeks**
**At 20 hrs/week: ~8-9 weeks**

---

## Next Steps

1. **Immediate:** Run through WS1 setup tasks (can be done in a single session)
2. **This week:** Start WS2 — get the engine working and validated against Excel
3. **Parallel:** Begin WS7.1-7.4 (writing tasks have no technical dependencies)
4. **Next conversation:** Break down WS3-WS7 to the same code-level granularity as WS1-WS2
5. **Key dependency:** WS2.5 (Excel validation) requires you to run the Alex demo scenario through your original spreadsheet and record exact outputs
