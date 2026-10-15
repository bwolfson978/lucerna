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
 * Drive one conversation to a result card and a what-if (same steps as ui-drift.spec.ts).
 * `onSummary` runs while the scenario summary waits for Run the numbers.
 */
async function converse(page, onSummary = async () => {}) {
  await page.goto('/calculator')
  await page.getByLabel('Message').fill(MESSAGE)
  await page.getByRole('button', { name: 'Send' }).click()
  const summary = page.getByTestId('scenario-summary')
  const run = summary.getByRole('button', { name: 'Run the numbers' })
  await run.waitFor({ timeout: 30000 })
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
      await page.getByRole('radio', { name: 'My numbers' }).click()
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('form', 'Calculator in form mode ("My numbers")', { fullPage: true })

      // Margaret's numbers. Fields that only exist on one side are skipped there.
      const fill = (label, value) => page.getByLabel(label, { exact: true }).first().fill(String(value))
      await fill('Age', 63)
      await page.getByLabel('Filing status').click()
      await page.getByRole('option', { name: /Married/ }).click()
      await fill('Current income', 20000)
      await fill('Traditional IRA/401(k) balance', 1400000)
      await fill('Retirement age', 73)
      await fill('Roth IRA/401(k) balance', 52000)
      await fill('Income growth rate (%)', 0)
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
      await page.getByRole('button', { name: /run my scenario/i }).click()
      await page.getByText('Estimated lifetime tax savings', { exact: false }).first().waitFor({ timeout: 90000 })
      await page.waitForLoadState('networkidle')
      await shot('results', "Results for Margaret's numbers", { fullPage: true })
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
      await shot('start', 'Calculator, conversation mode, before any message')
      await converse(page, async (summary) => {
        // Let a smooth scroll to the sent message settle before the viewport shot.
        await page.waitForTimeout(1000)
        await shot('sent', 'Right after sending the first message: what the screen shows')
        await shot('summary', 'Scenario summary, waiting for Run the numbers', { element: summary })
      })
      const result = view(page, 0).locator('[data-ui=result-card]')
      await result.waitFor({ timeout: 30000 })
      await result.locator('[data-ui=bracket-fill]').waitFor({ timeout: 30000 })
      await result.evaluate(() => document.fonts.ready)
      await shot('result-card', 'Result card after "Run the numbers"', {
        element: page.getByTestId('mcp-app').first(),
      })
      const compare = view(page, 1).locator('[data-ui=scenario-compare]')
      await compare.waitFor({ timeout: 30000 })
      await shot('what-if', 'What-if card for "retire at 58"', { element: page.getByTestId('mcp-app').nth(1) })
      // Full results for the scenario, opened from the result card.
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
      const box = await hero.locator('input[type=range]').boundingBox()
      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2)
      await page.waitForTimeout(800)
      await shot('results-hero-moved', 'Full results after moving the slider below the optimum', { element: hero })
    },
  },

  methodology: {
    title: 'Methodology',
    paths: ['frontend/src/app/methodology/', 'frontend/src/components/methodology/', 'frontend/src/content/'],
    async run(page, shot) {
      await page.goto('/methodology')
      await page.getByRole('heading', { level: 1 }).waitFor()
      await shot('top', 'Methodology, first screen')
      await shot('full', 'Methodology, whole page', { fullPage: true })
    },
  },

  'methodology-sidebar': {
    title: 'How it works sidebar (Assumptions & Limitations)',
    paths: ['frontend/src/components/methodology/', 'frontend/src/content/'],
    async run(page, shot) {
      await page.goto('/calculator')
      await page.getByRole('button', { name: 'How does it work?' }).first().click()
      const sidebar = page.getByRole('complementary', { name: 'How it works' })
      await sidebar.getByRole('button', { name: /Assumptions & Limitations/ }).click()
      await page.waitForTimeout(600)
      const section = sidebar.locator('#assumptions-limitations')
      await section.scrollIntoViewIfNeeded()
      await shot('assumptions', 'How it works: Assumptions & Limitations', { element: section })
    },
  },
}
