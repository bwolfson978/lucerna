import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The scenario panel: beside the conversation on desktop, a sheet opened from the
 * "Your scenario" bar above the message box on phones.
 */
export async function openScenario(page: Page): Promise<Locator> {
  const bar = page.getByRole('button', { name: /^Review your scenario/ })
  const panel = page.getByTestId('scenario-panel')
  const shown = panel.filter({ visible: true }).first()
  // On desktop the panel can open by itself (a restored draft, or the first values the
  // assistant fills in), hiding the bar mid-click, so retry until the panel is showing.
  await expect(async () => {
    if (await shown.isVisible()) return
    await bar.click({ timeout: 1000 })
    await expect(shown).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
  return shown
}

/** Press Run the numbers in the scenario panel. */
export async function runScenario(page: Page): Promise<void> {
  const panel = await openScenario(page)
  await panel.getByRole('button', { name: 'Run the numbers' }).click({ timeout: 20000 })
}

/** Every value in one form: the details view the panel opens. */
export async function openDetails(page: Page): Promise<void> {
  const panel = await openScenario(page)
  await panel.getByRole('button', { name: /^Income in retirement/ }).click()
  await page.getByRole('heading', { name: 'All the details.' }).waitFor()
}
