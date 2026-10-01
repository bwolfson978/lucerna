import { test, expect } from '@playwright/test'
import { alexScenario } from '../fixtures/test-data'

test.describe('Calculator form', () => {
  test('fills in the form and sees results', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Talk through your numbers' }).first().click()
    await page.getByRole('radio', { name: 'Fill in a form' }).click()

    await page.getByLabel('Age', { exact: true }).fill(String(alexScenario.age))
    await page.getByLabel('Filing status').click()
    await page.getByRole('option', { name: 'Single' }).click()
    await page.getByLabel('Current income').fill(String(alexScenario.income))
    await page.getByLabel('Traditional IRA/401(k) balance').fill(String(alexScenario.traditional_ira_balance))
    await page.getByLabel('Retirement age', { exact: true }).fill(String(alexScenario.retirement_age))
    await page.getByRole('button', { name: /run my scenario/i }).click()

    await expect(page.getByText(/Total Roth conversion/i)).toBeVisible({ timeout: 30000 })
  })
})
