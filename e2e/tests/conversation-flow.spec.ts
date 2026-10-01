import { test, expect } from '@playwright/test'

// Runs against the backend's offline stand-in model (AGENT_OFFLINE=1, see
// playwright.config.ts), so the real loop, tools and engine are exercised
// without an Anthropic API key.

test.describe('Conversation flow', () => {
  test('describe, confirm, run, explore a what-if and open full results', async ({ page }) => {
    await page.goto('/calculator')
    await expect(page.getByRole('radio', { name: 'Talk it through' })).toHaveAttribute('aria-checked', 'true')

    await page.getByLabel('Message').fill("I'm 52, married, income $90,000 a year, $600k in my 401k, I want to retire at 60")
    await page.getByRole('button', { name: 'Send' }).click()

    const summary = page.getByTestId('scenario-summary')
    await expect(summary).toBeVisible({ timeout: 15000 })
    await expect(summary.getByText('$600,000')).toBeVisible()

    await summary.getByRole('button', { name: 'Run the numbers' }).click()
    // The result card is the MCP server's own View (MCP Apps), mounted by the host in a
    // sandbox proxy (outer iframe) that loads the View (inner iframe).
    const headline = page
      .frameLocator('[data-testid=mcp-app] iframe')
      .frameLocator('iframe')
      .locator('[data-ui=result-card]')
    await expect(headline).toBeVisible({ timeout: 30000 })
    await expect(headline.getByText(/\$\d/).first()).toBeVisible()

    await page.getByLabel('Message').fill('What if I retire at 58?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByTestId('scenario-compare')).toBeVisible({ timeout: 20000 })

    await headline.getByRole('button', { name: 'See full results' }).click()
    await expect(page).toHaveURL(/view=results/)
    await expect(page.getByRole('button', { name: /Back to conversation/ })).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId('scenario-compare')).toBeVisible()

    // The form holds what the conversation captured.
    await page.getByRole('radio', { name: 'Fill in a form' }).click()
    await expect(page.getByLabel('Age', { exact: true })).toHaveValue('52')

    // No horizontal scroll at phone widths.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width)
  })

  test('the conversation survives a reload', async ({ page }) => {
    await page.goto('/calculator')
    await page.getByLabel('Message').fill("I'm 40, single, income $120,000, $300k in my IRA, retire at 55")
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByTestId('scenario-summary')).toBeVisible({ timeout: 15000 })
    await page.reload()
    await expect(page.getByTestId('scenario-summary')).toBeVisible()
  })
})
