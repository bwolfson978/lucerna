import type { Locator, Page } from '@playwright/test'
import { test, expect, watchPageErrors } from '../fixtures/test'
import { runScenario } from '../fixtures/scenario'

// Cards are shared components (ui/) rendered two ways: natively by the web app, and by
// the MCP server's Views inside sandboxed iframes (preact/compat, Tailwind compiled
// from the same preset). This check renders the same results both ways and compares
// what the user sees, so the two cannot drift.

const STYLES = [
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'color',
  'background-color',
  'border-top-width',
  'border-top-color',
  'border-top-left-radius',
  'padding-top',
  'padding-left',
  'box-shadow',
  'min-height',
]

async function measure(scope: Locator, parts: string[]) {
  const out: Record<string, unknown> = {}
  for (const part of parts) {
    const els = scope.locator(`[data-ui=${part}]`)
    await expect(els.first()).toBeVisible()
    out[part] = await els.evaluateAll(
      (nodes, styles) =>
        nodes.map((node) => {
          const cs = getComputedStyle(node)
          const box = node.getBoundingClientRect()
          return {
            text: node.textContent?.trim(),
            width: Math.round(box.width),
            height: Math.round(box.height),
            ...Object.fromEntries(styles.map((s) => [s, cs.getPropertyValue(s)])),
          }
        }),
      STYLES
    )
  }
  return out
}

/** Drive one conversation to a result and a what-if (offline model: deterministic). */
async function converse(page: Page) {
  await page.goto('/calculator')
  // The sample message lands once the page is interactive; typing before that races hydration.
  await expect(page.getByLabel('Message')).toHaveValue(/^I'm 55 and single/)
  await page.getByLabel('Message').fill("I'm 52, married, income $90,000 a year, $600k in my 401k, I want to retire at 60")
  await page.getByRole('button', { name: 'Send' }).click()
  // The scenario is captured: the panel (desktop) or the bar (phones) says it's ready.
  await page.getByText(/Ready to run/).filter({ visible: true }).first().waitFor({ timeout: 20000 })
  await runScenario(page)
  await expect(page.getByTestId('mcp-app')).toHaveCount(1, { timeout: 30000 })
  await page.getByLabel('Message').fill('What if I retire at 58?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('mcp-app')).toHaveCount(2, { timeout: 30000 })
}

const RESULT_PARTS = ['result-card', 'eyebrow', 'hero', 'stat-value', 'cta', 'bracket-fill']
const COMPARE_PARTS = ['scenario-compare', 'eyebrow', 'hero', 'cta']

async function showBrackets(card: Locator) {
  await expect(card.locator('[data-ui=bracket-fill]')).toBeVisible()
}

test('native and MCP App renders of the shared cards match', async ({ page, browser, pageErrors }) => {
  test.setTimeout(120000)

  // MCP App renders: the Views, two iframes deep (sandbox proxy, then the View).
  await converse(page)
  const views = [0, 1].map((i) =>
    page.locator('[data-testid=mcp-app]').nth(i).frameLocator('iframe').frameLocator('iframe').locator('#root')
  )
  await expect(views[0].locator('[data-ui=result-card]')).toBeVisible({ timeout: 30000 })
  await expect(views[1].locator('[data-ui=scenario-compare]')).toBeVisible({ timeout: 30000 })
  await showBrackets(views[0])
  await views[0].evaluate(() => document.fonts.ready)

  // Native renders: block the sandbox so Views never load and the host keeps its native
  // fallbacks, which are the same components fed the same tool results.
  const context = await browser.newContext({ viewport: page.viewportSize()! })
  watchPageErrors(context, pageErrors)
  const nativePage = await context.newPage()
  await nativePage.route('**/mcp-apps/sandbox**', (route) => route.abort())
  await converse(nativePage)
  const natives = [0, 1].map((i) => nativePage.getByTestId('mcp-app-fallback').nth(i))
  await showBrackets(natives[0])
  await nativePage.evaluate(() => document.fonts.ready)

  expect(await measure(views[0], RESULT_PARTS)).toEqual(await measure(natives[0], RESULT_PARTS))
  expect(await measure(views[1], COMPARE_PARTS)).toEqual(await measure(natives[1], COMPARE_PARTS))
  await context.close()
})
