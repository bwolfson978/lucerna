import type { Locator, Page } from '@playwright/test'

/**
 * The scenario panel: beside the conversation on desktop, a sheet opened from the
 * "Your scenario" bar above the message box on phones.
 */
export async function openScenario(page: Page): Promise<Locator> {
  const bar = page.getByRole('button', { name: /^Review your scenario/ })
  const panel = page.getByTestId('scenario-panel')
  await bar.or(panel).filter({ visible: true }).first().waitFor()
  if (await bar.isVisible()) await bar.click()
  const shown = panel.filter({ visible: true }).first()
  await shown.waitFor()
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
