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

/** Drive one conversation to a result card and a what-if (same steps as ui-drift.spec.ts). */
async function converse(page) {
  await page.goto('/calculator')
  await page.getByLabel('Message').fill(MESSAGE)
  await page.getByRole('button', { name: 'Send' }).click()
  const summary = page.getByTestId('scenario-summary')
  await summary.getByRole('button', { name: 'Run the numbers' }).click({ timeout: 30000 })
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
      await converse(page)
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
