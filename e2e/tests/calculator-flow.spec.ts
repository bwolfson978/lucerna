import { test, expect } from '../fixtures/test'
import { openDetails } from '../fixtures/scenario'
import { alexScenario } from '../fixtures/test-data'

const view = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid=mcp-app]').first().frameLocator('iframe').frameLocator('iframe')

test.describe('Calculator form', () => {
  test('fills in the details and sees results', async ({ page }) => {
    // A form fill and an optimizer run in the conversation: more than the default budget.
    test.setTimeout(60000)
    await page.goto('/')
    await page.getByRole('link', { name: 'Discuss your numbers' }).first().click()
    await openDetails(page)

    await page.getByLabel('Born', { exact: true }).click()
    await page.getByRole('option', { name: 'June' }).click()
    await page.getByLabel('Born: year', { exact: true }).fill(String(new Date().getFullYear() - alexScenario.age))
    await page.getByLabel('Filing status').click()
    await page.getByRole('option', { name: 'Single' }).click()
    await page.getByLabel('Earned income', { exact: true }).fill(String(alexScenario.income))
    await page.getByLabel('Traditional IRA/401(k) balance').fill(String(alexScenario.traditional_ira_balance))
    await page.getByLabel('Retirement age', { exact: true }).fill(String(alexScenario.retirement_age))
    await page.getByRole('main').getByRole('button', { name: 'Run the numbers' }).click()

    // The assistant runs it in the conversation; the result card opens the full results.
    await view(page).getByRole('button', { name: 'See full results' }).click({ timeout: 30000 })
    await expect(page.getByTestId('results-hero')).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'Compare strategies' })).toBeVisible()
  })
})
