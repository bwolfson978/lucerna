import { test, expect, type Locator, type Page } from '@playwright/test'

// The result card is one shared component (ui/src/ResultCard.tsx) rendered two ways:
// natively by the web app, and by the MCP server's View inside a sandboxed iframe
// (preact/compat, Tailwind compiled from the same preset). This check renders the same
// demo result both ways and compares what the user sees, so the two cannot drift.

const PARTS = ['result-card', 'eyebrow', 'hero', 'stat-value', 'conversion-strip', 'cta']
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

async function measure(scope: Locator) {
  const out: Record<string, unknown> = {}
  for (const part of PARTS) {
    const el = scope.locator(`[data-ui=${part}]`).first()
    await expect(el).toBeVisible()
    out[part] = await el.evaluate((node, styles) => {
      const cs = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      return {
        text: node.textContent?.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        ...Object.fromEntries(styles.map((s) => [s, cs.getPropertyValue(s)])),
      }
    }, STYLES)
  }
  return out
}

async function openDemo(page: Page) {
  await page.goto('/demo')
  await expect(page.getByTestId('mcp-app')).toBeVisible({ timeout: 30000 })
}

test('native and MCP App renders of the result card match', async ({ page, browser }) => {
  // MCP App render: the View, two iframes deep (sandbox proxy, then the View).
  await openDemo(page)
  const view = page
    .frameLocator('[data-testid=mcp-app] iframe')
    .frameLocator('iframe')
    .locator('#root')
  await expect(view.locator('[data-ui=result-card]')).toBeVisible({ timeout: 30000 })
  await view.evaluate(() => document.fonts.ready)

  // Native render: block the sandbox so the View never loads and the host keeps its
  // native fallback, which is the same component fed the same structuredContent.
  const context = await browser.newContext({ viewport: page.viewportSize()! })
  const nativePage = await context.newPage()
  await nativePage.route('**/mcp-apps/sandbox**', (route) => route.abort())
  await openDemo(nativePage)
  const native = nativePage.getByTestId('mcp-app-fallback')
  await expect(native.locator('[data-ui=result-card]')).toBeVisible({ timeout: 30000 })
  await nativePage.evaluate(() => document.fonts.ready)

  const [fromView, fromNative] = [await measure(view), await measure(native)]
  expect(fromView).toEqual(fromNative)
  await context.close()
})
