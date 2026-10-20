/**
 * Named flows for before/after captures (see .agents/skills/pr-evidence).
 *
 * Each flow drives the app the way a person would and calls `shot` at the moments a
 * reviewer needs to see. The same flow runs against the base branch and the PR head, so
 * a shot's name pairs the two sides: keep names stable and steps deterministic (the
 * backend runs the offline agent, so conversations always answer the same way).
 *
 * shot(name, caption, { element, highlight, fullPage })
 *   element:   a Locator to crop to (default: the viewport)
 *   highlight: a Locator to box on the annotated frame
 *   fullPage:  capture the whole scrollable page
 */

const MESSAGE = "I'm 52, married, income $90,000 a year, $600k in my 401k, I want to retire at 60"

/**
 * The scenario once the conversation has captured it, waiting for Run the numbers: the
 * summary card in the conversation (before the scenario panel), or the scenario panel
 * (opened as a sheet on phones).
 */
async function scenarioReady(page, onCaptured = async () => {}) {
  const hasPanel = (await page.getByTestId('scenario-panel').count()) > 0
  if (!hasPanel) {
    await page.getByTestId('scenario-summary').first().waitFor({ timeout: 30000 })
    await onCaptured()
    return page.getByTestId('scenario-summary')
  }
  // The panel (desktop) or the bar above the message box (phones) says it's ready.
  await page.getByText(/Ready to run/).filter({ visible: true }).first().waitFor({ timeout: 30000 })
  await onCaptured()
  const bar = page.getByRole('button', { name: /^Review your scenario/ })
  await bar.or(page.getByTestId('scenario-panel')).filter({ visible: true }).first().waitFor()
  if (await bar.isVisible()) await bar.click()
  const panel = page.getByTestId('scenario-panel').filter({ visible: true }).first()
  await panel.getByRole('button', { name: 'Run the numbers' }).waitFor({ timeout: 30000 })
  return panel
}

/**
 * The sample message lands once the page is interactive; typing before that races
 * hydration. Builds from before the sample have none, so this gives up quietly.
 */
async function waitForSample(page) {
  await page
    .waitForFunction(
      () => document.getElementById('conversation-input')?.value.startsWith("I'm 55 and single"),
      null,
      { timeout: 8000 }
    )
    .catch(() => {})
}

/** The full scenario form: "My numbers" before the scenario panel, its details view after. */
async function openForm(page) {
  const radio = page.getByRole('radio', { name: 'My numbers' })
  const bar = page.getByRole('button', { name: /^Review your scenario/ })
  const panel = page.getByTestId('scenario-panel')
  await radio.or(bar).or(panel).filter({ visible: true }).first().waitFor()
  if (await radio.count()) return radio.click()
  if (await bar.isVisible()) await bar.click()
  await page.getByRole('button', { name: /^Income in retirement/ }).filter({ visible: true }).first().click()
  await page.getByRole('button', { name: /Back to conversation/ }).waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
}

/**
 * Drive one conversation to a result card and a what-if (same steps as ui-drift.spec.ts).
 * `onSent` runs once the scenario is captured, before anything opens it; `onSummary`
 * runs while the scenario waits for Run the numbers.
 */
async function converse(page, { onSent = async () => {}, onSummary = async () => {} } = {}) {
  await page.goto('/calculator')
  await waitForSample(page)
  await page.getByLabel('Message').fill(MESSAGE)
  await page.getByRole('button', { name: 'Send' }).click()
  const summary = await scenarioReady(page, onSent)
  const run = summary.getByRole('button', { name: 'Run the numbers' })
  await onSummary(summary)
  await run.click()
  await page.getByTestId('mcp-app').first().waitFor({ timeout: 60000 })
  await page.getByLabel('Message').fill('What if I retire at 58?')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByTestId('mcp-app').nth(1).waitFor({ timeout: 60000 })
}

/** The View inside an MCP App frame: two iframes deep (sandbox proxy, then the View). */
function view(page, i) {
  return page.getByTestId('mcp-app').nth(i).frameLocator('iframe').frameLocator('iframe').locator('#root')
}

/** Changes to these touch every page, so they select every flow. */
export const GLOBAL_PATHS = [
  'frontend/src/app/globals.css',
  'frontend/src/app/layout.tsx',
  'frontend/tailwind.config',
  'ui/tailwind/',
  'ui/styles/',
]

export const flows = {
  about: {
    title: 'About page and its links',
    paths: ['frontend/src/app/about/', 'frontend/public/barry.jpg', 'frontend/src/components/common/Header', 'frontend/src/components/common/PageFooter'],
    async run(page, shot) {
      await page.goto('/methodology')
      await shot('header', 'Site header', { element: page.locator('header').first() })
      const footer = page.locator('footer').last()
      await footer.scrollIntoViewIfNeeded()
      await shot('footer', 'Site footer', { element: footer })
      await page.goto('/about')
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('about', 'About page, first screen')
      await shot('about-full', 'About page, whole page', { fullPage: true })
    },
  },

  headerWidths: {
    title: 'Site header on the Demo page at tight widths',
    paths: ['frontend/src/components/common/Header', 'frontend/src/components/methodology/HowItWorksButton'],
    async run(page, shot) {
      // The Demo page has the fullest signed-out header (every link plus the
      // "How does it work?" pill), so it is the first to run out of room.
      const desktop = page.viewportSize().width >= 1000
      for (const width of desktop ? [1100, 1280] : [440]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/demo')
        await page.locator('header').first().waitFor()
        await shot(`demo-header-${width}`, `Demo page header at ${width} px`, { element: page.locator('header').first() })
      }
    },
  },

  landing: {
    title: 'Landing page',
    paths: ['frontend/src/app/page.tsx', 'frontend/src/components/landing/', 'frontend/src/components/common/'],
    async run(page, shot) {
      await page.goto('/')
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('hero', 'Landing page, first screen')
      await shot('full', 'Landing page, whole page', { fullPage: true })
    },
  },

  'landing-margaret': {
    title: "Landing page: Margaret's schedule and spotlight",
    paths: ['frontend/src/components/landing/LandingDemo', 'backend/app/engine/demo.py'],
    async run(page, shot) {
      await page.goto('/')
      await page.getByRole('heading', { level: 1 }).waitFor()
      for (const [id, caption] of [
        ['schedule', "Margaret's conversion schedule"],
        ['scenario', 'Margaret spotlight'],
      ]) {
        const section = page.locator(`section#${id}`)
        await section.scrollIntoViewIfNeeded()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1500)
        await shot(id, caption, { element: section })
      }
    },
  },

  'policy-pages': {
    title: 'Footer links and policy pages',
    paths: [
      'frontend/src/app/privacy/',
      'frontend/src/app/terms/',
      'frontend/src/app/support/',
      'frontend/src/components/legal/',
      'frontend/src/components/common/PageFooter',
    ],
    async run(page, shot) {
      await page.goto('/methodology')
      const footer = page.locator('footer').last()
      await footer.scrollIntoViewIfNeeded()
      await shot('footer', 'Site footer', { element: footer })
      for (const [path, caption] of [
        ['/privacy', 'Privacy Policy'],
        ['/terms', 'Terms of Service'],
        ['/support', 'Support'],
        ['/connect', 'Use it in Claude or ChatGPT'],
      ]) {
        await page.goto(path)
        await page.getByRole('heading', { level: 1 }).waitFor()
        await shot(path.slice(1), caption)
      }
      await page.goto('/privacy')
      for (const [id, caption] of [
        ['what-we-collect', 'Privacy: what we collect'],
        ['claude-and-chatgpt', 'Privacy: in Claude and ChatGPT'],
      ]) {
        const section = page.locator(`#${id}`)
        await section.scrollIntoViewIfNeeded()
        await shot(`privacy-${id}`, caption, { element: section })
      }
    },
  },

  connect: {
    title: 'Claude & ChatGPT page and its header link',
    paths: [
      'frontend/src/app/connect/',
      'frontend/src/components/connect/',
      'frontend/src/components/common/Header',
      'frontend/src/components/common/CopyField',
    ],
    async run(page, shot) {
      await page.goto('/connect')
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('header', 'Site header', { element: page.locator('header').first() })
      await shot('top', 'Claude & ChatGPT page, first screen')
      await shot('full', 'Claude & ChatGPT page, whole page', { fullPage: true })
      const toggle = page.getByRole('button', { name: 'Toggle menu' })
      if (await toggle.isVisible()) {
        await toggle.click()
        await shot('menu', 'Phone menu', { element: page.getByRole('navigation', { name: 'Mobile' }) })
      }
    },
  },

  feedback: {
    title: 'Feedback and problem reports',
    paths: [
      'frontend/src/app/feedback/',
      'frontend/src/components/common/FeedbackForm',
      'frontend/src/components/common/ErrorNotice',
      'frontend/src/components/common/PageFooter',
    ],
    async run(page, shot) {
      await page.goto('/')
      const footer = page.getByRole('navigation', { name: 'Footer' })
      await footer.scrollIntoViewIfNeeded()
      await shot('footer', 'Footer links', { element: page.locator('footer') })
      await page.goto('/feedback')
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('feedback', 'Feedback page')
      await page.getByRole('radio', { name: 'Report a problem' }).click()
      await page.getByLabel('What went wrong?').fill('The chart under my results is blank.')
      await shot('problem', 'Report a problem, filled in', { element: page.locator('form') })
      await page.getByRole('button', { name: 'Send' }).click()
      await page.getByRole('status').waitFor()
      await shot('sent', 'After sending', { element: page.getByRole('status') })
    },
  },

  'signed-out-links': {
    title: 'Saved-scenario links while signed out',
    paths: ['frontend/src/app/my-scenarios/', 'frontend/src/components/common/SignInRequired'],
    async run(page, shot) {
      // Local runs have no Clerk key, so every visitor is signed out (the sign-in
      // button itself needs Clerk and is not drawn).
      await page.goto('/my-scenarios')
      await page.waitForLoadState('networkidle')
      await shot('my-scenarios', 'Opening My Scenarios while signed out')
      await page.goto('/calculator?saved=00000000-0000-0000-0000-000000000000')
      await page.waitForLoadState('networkidle')
      await shot('saved-link', 'Opening a saved-scenario link while signed out')
    },
  },

  'calculator-form': {
    title: 'Calculator form',
    paths: ['frontend/src/app/calculator/', 'frontend/src/components/calculator/', 'frontend/src/components/ui/'],
    async run(page, shot) {
      await page.goto('/calculator')
      await openForm(page)
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('form', 'The whole scenario as a form', { fullPage: true })

      // Margaret's numbers. Fields that only exist on one side are skipped there.
      const fill = async (label, value) => {
        const field = page.getByLabel(label, { exact: true }).first()
        if (await field.count()) await field.fill(String(value))
      }
      await fill('Age', 63)
      await page.getByLabel('Filing status').click()
      await page.getByRole('option', { name: /Married/ }).click()
      await fill('Current income', 20000)
      await fill('Traditional IRA/401(k) balance', 1400000)
      await fill('Retirement age', 73)
      await fill('Roth IRA/401(k) balance', 52000)
      await fill('Income growth rate (%)', 0)
      await fill('Yearly income growth', 0)
      await fill('Yearly spend in retirement', 95000)
      const addSs = page.getByRole('button', { name: '+ Social Security' })
      if (await addSs.count()) {
        await fill('Current income ends at age', 66)
        await addSs.click()
        await fill('Yearly amount', 46000)
        await page.getByRole('button', { name: 'Done' }).click()
        await addSs.click()
        await fill('Yearly amount', 14000)
        await fill('Starts at age', 68)
        await page.getByRole('button', { name: 'Done' }).click()
      }
      await shot('filled', "Form with Margaret's numbers", { fullPage: true })
      await page
        .getByRole('button', { name: /run my scenario|run the numbers/i })
        .filter({ visible: true })
        .first()
        .click()
      // Results show under the form, or (with the scenario panel) in the conversation.
      const inPage = page.getByText('Estimated lifetime tax savings', { exact: false }).first()
      await inPage.or(page.getByTestId('mcp-app')).first().waitFor({ timeout: 90000 })
      if (!(await inPage.isVisible())) {
        await view(page, 0).getByRole('button', { name: 'See full results' }).click({ timeout: 60000 })
        await page.getByTestId('results-hero').waitFor({ timeout: 30000 })
      }
      await page.waitForLoadState('networkidle')
      await shot('results', "Results for Margaret's numbers", { fullPage: true })
    },
  },

  retiree: {
    title: 'Retired couple with no income from work',
    paths: [
      'frontend/src/components/calculator/InputForm',
      'frontend/src/lib/scenario/',
      'ui/src/ScenarioSummary',
      'backend/app/tools/draft.py',
      'backend/app/tools/models.py',
    ],
    async run(page, shot) {
      // In the conversation: the scenario card with $0 income from work.
      await page.goto('/calculator')
      await waitForSample(page)
      await page
        .getByLabel('Message')
        .fill("I'm 66, married, retired with no income, $2.6M in my IRA, $80k Roth, started drawing at 65, spend $130k")
      await page.getByRole('button', { name: 'Send' }).click()
      const card = page.getByTestId('scenario-summary').or(page.getByTestId('scenario-panel')).filter({ visible: true })
      await page.getByText(/Ready to run|Still needed/).filter({ visible: true }).first().waitFor({ timeout: 30000 })
      const bar = page.getByRole('button', { name: /^Review your scenario/ })
      if (await bar.isVisible()) await bar.click()
      await page.waitForTimeout(800)
      await shot('summary', 'Scenario card for a retired couple with no income from work', { element: card.first() })

      // The form: $0 income from work, then run it.
      await page.goto('/calculator')
      await openForm(page)
      const fill = async (label, value) => {
        const field = page.getByLabel(label, { exact: true }).first()
        if (await field.count()) await field.fill(String(value))
      }
      await fill('Age', 66)
      await page.getByLabel('Filing status').click()
      await page.getByRole('option', { name: /Married/ }).click()
      await fill('Current income', 0)
      await fill('Earned income', 0)
      await fill('Traditional IRA/401(k) balance', 2600000)
      await fill('Retirement age', 65)
      await fill('Roth IRA/401(k) balance', 80000)
      await fill('Yearly spend in retirement', 130000)
      await page
        .getByRole('button', { name: /run my scenario|run the numbers/i })
        .filter({ visible: true })
        .first()
        .click()
      // Before: the form stops on the income field. After: the scenario runs.
      const error = page.getByText(/^Enter your (current income|earned income)/).first()
      const ran = page.getByTestId('mcp-app').or(page.getByText('Estimated lifetime tax savings')).first()
      await error.or(ran).waitFor({ timeout: 90000 })
      if (await error.isVisible()) {
        await error.scrollIntoViewIfNeeded()
        await page.evaluate(() => window.scrollBy(0, -200))
      } else {
        await page.waitForTimeout(3000)
      }
      await shot('form-run', 'After Run with $0 income from work')
    },
  },

  'aca-card': {
    title: 'ACA subsidy card in full results',
    paths: ['frontend/src/components/results/AcaSubsidyImpact', 'backend/app/engine/trace.py'],
    async run(page, shot) {
      // Retiring at 62 from California to Nevada, on the marketplace until 65
      const scenario = {
        age: 58,
        filing_status: 'married_filing_jointly',
        current_income: 140000,
        traditional_balance: 1270000,
        retirement_age: 62,
        retirement_spending: 95000,
        state: 'CA',
        retirement_state: 'NV',
        include_aca: true,
        household_size: 2,
        income_sources: [
          { kind: 'pension', amount: 30000, start_age: 65 },
          { kind: 'social_security', amount: 36000, start_age: 67 },
          { kind: 'social_security', owner: 'spouse', amount: 30000, start_age: 70 },
        ],
      }
      const encoded = Buffer.from(JSON.stringify(scenario)).toString('base64url')
      await page.goto(`/calculator?view=results&scenario=${encoded}`)
      const heading = page.getByRole('heading', { name: 'ACA marketplace subsidy impact' })
      await heading.waitFor({ timeout: 90000 })
      await page.waitForLoadState('networkidle')
      const card = heading.locator('xpath=../..')
      await card.scrollIntoViewIfNeeded()
      await shot('aca-card', 'ACA subsidy card for a CA to NV household retiring at 62', { element: card })

      // Single, Texas to Oregon at 58, living on traditional withdrawals near the cliff
      const single = {
        age: 55,
        filing_status: 'single',
        current_income: 95000,
        traditional_balance: 650000,
        roth_balance: 40000,
        retirement_age: 58,
        retirement_spending: 60000,
        state: 'TX',
        retirement_state: 'OR',
        include_aca: true,
        household_size: 1,
        income_sources: [{ kind: 'social_security', amount: 28000, start_age: 67 }],
      }
      const singleEncoded = Buffer.from(JSON.stringify(single)).toString('base64url')
      await page.goto(`/calculator?view=results&scenario=${singleEncoded}`)
      await heading.waitFor({ timeout: 90000 })
      await page.waitForLoadState('networkidle')
      await card.scrollIntoViewIfNeeded()
      await shot('aca-card-single', 'ACA subsidy card for a single filer moving TX to OR at 58', {
        element: card,
      })
    },
  },

  'result-single': {
    title: 'Result card in full results, single filer with Social Security',
    paths: ['frontend/src/components/results/', 'backend/app/engine/'],
    async run(page, shot) {
      // Single, Texas to Oregon at 58, $28,000 of Social Security from 67
      const scenario = {
        age: 55,
        filing_status: 'single',
        current_income: 95000,
        traditional_balance: 650000,
        roth_balance: 40000,
        retirement_age: 58,
        retirement_spending: 60000,
        state: 'TX',
        retirement_state: 'OR',
        include_aca: true,
        household_size: 1,
        income_sources: [{ kind: 'social_security', amount: 28000, start_age: 67 }],
      }
      const encoded = Buffer.from(JSON.stringify(scenario)).toString('base64url')
      await page.goto(`/calculator?view=results&scenario=${encoded}`)
      const card = page.getByTestId('results-hero')
      await card.waitFor({ timeout: 90000 })
      await page.waitForLoadState('networkidle')
      await card.scrollIntoViewIfNeeded()
      await shot('result', 'Result card for a single filer moving TX to OR at 58', { element: card })
    },
  },

  conversation: {
    title: 'Conversation to a result',
    paths: [
      'frontend/src/components/conversation/',
      'frontend/src/lib/agent/',
      'frontend/src/lib/mcp-apps/',
      'ui/src/',
      'mcp-views/',
      'backend/app/agent/',
      'backend/app/tools/',
      'backend/app/mcp/',
    ],
    async run(page, shot) {
      await page.goto('/calculator')
      await page.getByLabel('Message').waitFor()
      await shot('start', 'Calculator before any message')
      await converse(page, {
        onSent: async () => {
          // Let a smooth scroll to the sent message settle before the viewport shot.
          await page.waitForTimeout(1000)
          await shot('sent', 'Right after sending the first message: what the screen shows')
        },
        onSummary: async (summary) => {
          await page.waitForTimeout(400)
          await shot('summary', 'The captured scenario, waiting for Run the numbers', { element: summary })
          // Desktop panels that fold away: the closed state, then open again to run it.
          const hide = page.getByRole('button', { name: 'Hide your scenario' }).filter({ visible: true })
          if (await hide.count()) {
            await shot('panel-open', 'Scenario panel open beside the conversation')
            await hide.click()
            await page.waitForTimeout(600)
            // Park the video cursor in the empty margin so it doesn't read as a badge.
            await page.mouse.move(8, page.viewportSize().height - 8)
            await shot('panel-hidden', 'Scenario panel folded away: the conversation centered')
            await page.getByRole('button', { name: 'Show your scenario' }).click()
            await page.waitForTimeout(600)
          }
        },
      })
      const result = view(page, 0).locator('[data-ui=result-card]')
      await result.waitFor({ timeout: 30000 })
      await result.locator('[data-ui=bracket-fill]').waitFor({ timeout: 30000 })
      await result.evaluate(() => document.fonts.ready)
      await shot('result-card', 'Result card after "Run the numbers"', {
        element: page.getByTestId('mcp-app').first(),
      })
      // The card's slider (absent before it existed): convert less than the optimum.
      const slider = result.getByRole('slider', { name: 'Total amount to convert' })
      if (await slider.count()) {
        await slider.scrollIntoViewIfNeeded()
        const max = Number(await slider.getAttribute('max'))
        await slider.fill(String(Math.round((max * 0.2) / 100) * 100))
        // fill() focuses the input from code, which shows the keyboard focus ring; a drag would not.
        await slider.blur()
        await page.waitForTimeout(800)
        await shot('result-card-moved', 'Result card after moving its slider below the optimum', {
          element: page.getByTestId('mcp-app').first(),
        })
        await result.getByRole('button', { name: 'Back to most savings' }).click()
        await page.waitForTimeout(400)
      }
      const compare = view(page, 1).locator('[data-ui=scenario-compare]')
      await compare.waitFor({ timeout: 30000 })
      await shot('what-if', 'What-if card for "retire at 58"', { element: page.getByTestId('mcp-app').nth(1) })
      // Full results for the scenario, opened from the result card. On a phone the card is
      // taller than the screen; lift its bottom above the sticky composer before clicking.
      await page
        .getByTestId('mcp-app')
        .first()
        .evaluate((el) => {
          el.scrollIntoView({ block: 'end' })
          window.scrollBy(0, 240)
        })
      await page.waitForTimeout(300)
      await view(page, 0).getByRole('button', { name: 'See full results' }).click()
      await page.getByRole('button', { name: /Back to conversation/ }).waitFor({ timeout: 30000 })
      await page.waitForTimeout(1500)
      await shot('full-results', 'Full results (See full results on the result card)', { fullPage: true })
    },
  },

  demo: {
    title: 'Demo (Margaret)',
    paths: ['frontend/src/app/demo/', 'frontend/src/components/results/', 'frontend/src/lib/results/'],
    async run(page, shot) {
      await page.goto('/demo')
      await page.getByTestId('assistant-message').first().waitFor({ timeout: 60000 })
      await page.waitForLoadState('networkidle')
      await shot('page', 'Demo page with Margaret\'s results', { fullPage: true })
      // Margaret's long timeline is where the values under the bracket chart get crowded.
      const card = page.getByTestId('mcp-app').first()
      await card.scrollIntoViewIfNeeded()
      const result = view(page, 0).locator('[data-ui=result-card]')
      await result.locator('[data-ui=bracket-fill]').waitFor({ timeout: 30000 })
      await result.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(1000)
      await shot('result-card', 'Result card in the demo conversation', { element: card })
      await view(page, 0).getByRole('button', { name: 'See full results' }).click()
      const hero = page.getByTestId('results-hero')
      await hero.waitFor({ timeout: 30000 })
      await page.waitForTimeout(1500)
      await shot('results-hero', 'Full results at the highest-savings amount', { element: hero })
      // Off the optimum the "vs. highest savings" delta appears; it should not move the layout.
      const range = hero.locator('input[type=range]')
      const max = Number(await range.getAttribute('max'))
      await range.fill(String(Math.round((max * 0.7) / 100) * 100))
      await range.blur()
      await page.waitForTimeout(800)
      await shot('results-hero-moved', 'Full results after moving the slider below the optimum', { element: hero })
    },
  },

  inflation: {
    title: 'Inflation: a 40-year-old earning $70,000 with 3% raises',
    paths: [
      'backend/app/engine/inflation.py',
      'frontend/src/lib/utils/timeline.ts',
      'frontend/src/components/calculator/IncomePreviewChart',
      'ui/src/ScenarioSummary',
    ],
    async run(page, shot) {
      // The income preview and the additional settings in the form
      await page.goto('/calculator')
      await openForm(page)
      await page.getByRole('heading', { level: 1 }).waitFor()
      const fill = (label, value) => page.getByLabel(label, { exact: true }).first().fill(String(value))
      await fill('Age', 40)
      await fill('Current income', 70000)
      await fill('Traditional IRA/401(k) balance', 150000)
      await fill('Retirement age', 65)
      const preview = page.locator('section[aria-labelledby=income-preview-heading]')
      await preview.waitFor({ timeout: 30000 })
      await page.waitForTimeout(800)
      await shot('income-preview', 'Income preview for $70,000 with 3% raises, age 40 to 65', {
        element: preview,
      })
      await page.getByRole('button', { name: 'Additional settings' }).click()
      await page.waitForTimeout(600)
      const settings = page.getByLabel('Plan through age', { exact: true }).locator('xpath=ancestor::div[contains(@class, "grid")][1]')
      await shot('settings', 'Additional settings', { element: settings })

      // Full results for the same numbers, opened from a results link
      const scenario = {
        age: 40,
        filing_status: 'single',
        current_income: 70000,
        traditional_balance: 150000,
        retirement_age: 65,
      }
      const encoded = Buffer.from(JSON.stringify(scenario)).toString('base64url')
      await page.goto(`/calculator?view=results&scenario=${encoded}`)
      const hero = page.getByTestId('results-hero')
      await hero.waitFor({ timeout: 90000 })
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)
      await shot('results', 'Results for the same numbers', { element: hero })

      // The scenario card's assumptions, as the conversation shows them
      await page.goto('/calculator')
      await page.evaluate(() => window.localStorage.clear())
      await page.goto('/calculator')
      await waitForSample(page)
      await page.getByLabel('Message').fill(MESSAGE)
      await page.getByRole('button', { name: 'Send' }).click()
      const summary = await scenarioReady(page)
      await summary.getByRole('button', { name: /Assumptions/ }).click()
      await page.waitForTimeout(600)
      await shot('scenario-card', 'Scenario card with its assumptions open', { element: summary })
    },
  },

  methodology: {
    title: 'Methodology',
    paths: ['frontend/src/app/methodology/', 'frontend/src/components/methodology/', 'frontend/src/content/'],
    async run(page, shot) {
      await page.goto('/methodology')
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('top', 'Methodology, first screen')
      await shot('lifetime-model', 'The Lifetime Model section', { element: page.locator('section#npv-model') })
      await shot('assumptions', 'Assumptions & Limitations section', { element: page.locator('section#assumptions') })
      await shot('full', 'Methodology, whole page', { fullPage: true })
    },
  },

  'methodology-sidebar': {
    title: 'How it works sidebar (Assumptions & Limitations)',
    paths: ['frontend/src/components/methodology/', 'frontend/src/content/'],
    async run(page, shot) {
      await page.goto('/calculator')
      await page.getByRole('button', { name: 'How does it work?' }).first().click()
      const section = page.locator('#methodology-assumptions-limitations:visible').first()
      await section.getByRole('button', { name: /Assumptions & Limitations/ }).click()
      await page.waitForTimeout(600)
      // The "What's not included" paragraph, where the limits of the model are listed
      const limits = section.locator('p', { hasText: 'The few states that tax Social Security' })
      await limits.scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
      await shot('not-included', "How it works: What's not included", { element: limits })
    },
  },
}
