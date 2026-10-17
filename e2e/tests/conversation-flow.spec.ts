import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { openDetails, openScenario } from '../fixtures/scenario'

// A tool result rendered by the MCP server's own View (MCP Apps), mounted by the host
// in a sandbox proxy (outer iframe) that loads the View (inner iframe).
const view = (page: Page, index: number) =>
  page.locator('[data-testid=mcp-app]').nth(index).frameLocator('iframe').frameLocator('iframe')

// Runs against the backend's offline stand-in model (AGENT_OFFLINE=1, see
// playwright.config.ts), so the real loop, tools and engine are exercised
// without an Anthropic API key.

test.describe('Conversation flow', () => {
  test('describe, confirm, run, explore a what-if and open full results', async ({ page }) => {
    // Two optimizer runs, a page change and a what-if apply: more than the default budget.
    test.setTimeout(60000)
    await page.goto('/calculator')
    // The sample message lands once the page is interactive; typing before that races hydration.
    await expect(page.getByLabel('Message')).toHaveValue(/^I'm 55 and single/)

    await page.getByLabel('Message').fill("I'm 52, married, income $90,000 a year, $600k in my 401k, I want to retire at 60")
    await page.getByRole('button', { name: 'Send' }).click()

    // What the conversation captured lands in the scenario panel.
    const panel = await openScenario(page)
    await expect(panel.getByText('$600,000')).toBeVisible({ timeout: 15000 })
    await expect(panel.getByText('Ready to run')).toBeVisible()

    await panel.getByRole('button', { name: 'Run the numbers' }).click()
    const headline = view(page, 0).locator('[data-ui=result-card]')
    await expect(headline).toBeVisible({ timeout: 30000 })
    await expect(headline.getByText(/\$\d/).first()).toBeVisible()
    // The card shows how the conversions fill the tax brackets.
    await expect(headline.getByRole('img', { name: /against the tax brackets/ })).toBeVisible()
    // ...so the conversation doesn't repeat that chart in a card of its own.
    await expect(page.getByTestId('suggestions')).toBeVisible()
    await expect(page.getByText('How conversions fill your tax brackets')).toHaveCount(0)

    await page.getByLabel('Message').fill('What if I retire at 58?')
    await page.getByRole('button', { name: 'Send' }).click()
    const compare = view(page, 1).locator('[data-ui=scenario-compare]')
    await expect(compare).toBeVisible({ timeout: 30000 })

    await headline.getByRole('button', { name: 'See full results' }).click()
    await expect(page).toHaveURL(/view=results/)
    await expect(page.getByRole('button', { name: /Back to conversation/ })).toBeVisible()
    await page.goBack()
    await expect(compare).toBeVisible({ timeout: 30000 })

    // Apply sends a chat message from the View (ui/message); the assistant records the
    // what-if in the scenario.
    await compare.getByRole('button', { name: 'Apply to my scenario' }).click()
    await expect(page.getByText('Use the "Retire at 58" what-if as my scenario.')).toBeVisible()
    // The changed value is marked New in the panel (desktop) and counted on the bar (phones).
    await expect(
      page
        .getByRole('button', { name: /^Review your scenario.*1 new$/ })
        .or(page.getByTestId('scenario-panel').filter({ visible: true }).getByText('New', { exact: true }))
    ).toBeVisible({ timeout: 20000 })

    // The full details hold what the conversation captured.
    await openDetails(page)
    await expect(page.getByLabel('Age', { exact: true })).toHaveValue('52')
    await expect(page.getByLabel('Retirement age', { exact: true })).toHaveValue('58')

    // No horizontal scroll at phone widths.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width)
  })

  test('the conversation survives a reload', async ({ page }) => {
    await page.goto('/calculator')
    // The sample message lands once the page is interactive; typing before that races hydration.
    await expect(page.getByLabel('Message')).toHaveValue(/^I'm 55 and single/)
    await page.getByLabel('Message').fill("I'm 40, single, income $120,000, $300k in my IRA, retire at 55")
    await page.getByRole('button', { name: 'Send' }).click()
    await expect((await openScenario(page)).getByText('$300,000')).toBeVisible({ timeout: 15000 })
    await page.reload()
    await expect(page.getByText("I'm 40, single, income $120,000")).toBeVisible()
    const panel = await openScenario(page)
    await expect(panel.getByText('$300,000')).toBeVisible()
  })
})
