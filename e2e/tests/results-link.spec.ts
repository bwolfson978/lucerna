import { test, expect } from '../fixtures/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// "See full results" in ChatGPT or Claude opens the tool's full_results_url in a fresh
// browser with no conversation. The link carries its scenario, so the site rebuilds it
// and shows the same result.
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/fixtures/view-data.json'), 'utf8')
)

test('a full results link from another app opens the same result', async ({ page }) => {
  const analysis = fixture.analyze_roth_conversions.structured_content
  const link = new URL(analysis.full_results_url)
  await page.goto(`/calculator${link.search}`)

  await expect(page.getByRole('button', { name: /Back to conversation/ })).toBeVisible({
    timeout: 30000,
  })
  const savings = analysis.estimated_lifetime_tax_savings_todays_dollars.toLocaleString('en-US')
  await expect(page.getByText(`$${savings}`).first()).toBeVisible()

  // Back in the conversation, the scenario is filled in and ready to talk about.
  await page.getByRole('button', { name: /Back to conversation/ }).click()
  await page.getByRole('radio', { name: 'My numbers' }).click()
  await expect(page.getByLabel('Age', { exact: true })).toHaveValue(String(fixture.scenario.age))
})
