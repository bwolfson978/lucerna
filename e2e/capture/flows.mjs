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
}
