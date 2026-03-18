import { test, expect } from '@playwright/test'
import { alexScenario } from '../fixtures/test-data'

test.describe('Calculator flow', () => {
  test('completes 3-step form and sees results', async ({ page }) => {
    await page.goto('/')

    // Navigate to calculator
    const calcCta = page.getByRole('link', { name: /calculate|get started|start/i })
    await calcCta.click()

    // Step 1: Personal info
    await page.getByLabel(/age/i).fill(String(alexScenario.age))
    await page.getByLabel(/income/i).fill(String(alexScenario.income))
    await page.getByRole('button', { name: /next|continue/i }).click()

    // Step 2: Retirement details
    await page.getByLabel(/retirement age/i).fill(String(alexScenario.retirement_age))
    await page.getByLabel(/ira balance|traditional/i).fill(String(alexScenario.traditional_ira_balance))
    await page.getByRole('button', { name: /next|continue/i }).click()

    // Step 3: Location
    await page.getByLabel(/current state/i).fill(alexScenario.current_tax_state)
    await page.getByLabel(/retirement state/i).fill(alexScenario.retirement_tax_state)
    await page.getByRole('button', { name: /calculate|analyze|submit/i }).click()

    // Results page
    await expect(page.getByText(/conversion/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/savings|tax/i)).toBeVisible()
  })
})
