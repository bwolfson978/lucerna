import { test, expect } from '../fixtures/test'

test.describe('Demo conversation', () => {
  test('walks through Margaret with the tour and accepts a follow-up', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'See an example' }).first().click()
    await expect(page).toHaveURL(/\/demo/)

    // The tour stops the replay at each step until the visitor moves on.
    const popover = page.locator('.driver-popover')
    const step = async (title: string, button: string) => {
      await expect(popover.getByText(title)).toBeVisible({ timeout: 30000 })
      await popover.getByRole('button', { name: button }).click()
    }
    await expect(page.getByText(/Hi, I'm Margaret/)).toBeVisible({ timeout: 20000 })
    await step('Margaret describes her situation', 'Next')
    await step('Her numbers are recorded', 'Next')
    // Her second message is not sent until the visitor taps the button.
    await expect(popover.getByText('She confirms it')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('That all looks right. Run the numbers.')).toHaveCount(0)
    await step('She confirms it', 'Run the numbers')
    await expect(page.getByText('That all looks right. Run the numbers.')).toBeVisible()

    await step('Her results', 'Next')
    const card = page
      .frameLocator('[data-testid=mcp-app] iframe')
      .frameLocator('iframe')
      .getByText('Estimated lifetime tax savings')
    await expect(card).toBeVisible({ timeout: 30000 })
    await step('Your turn', 'Done')
    await expect(popover).toHaveCount(0)
    await expect(page.getByText('Ready to try yours?')).toBeVisible({ timeout: 30000 })

    await page.getByLabel('Message').fill('How do RMDs work?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText(/Required Minimum Distributions/i).last()).toBeVisible({ timeout: 20000 })
  })
})

test.describe('Demo conversation, tour skipped', () => {
  test('closing the tour plays the rest of the conversation', async ({ page }) => {
    await page.goto('/demo')
    const popover = page.locator('.driver-popover')
    await expect(popover.getByText('Margaret describes her situation')).toBeVisible({ timeout: 30000 })
    await popover.getByRole('button', { name: 'Skip the tour' }).click()
    await expect(page.getByText('Ready to try yours?')).toBeVisible({ timeout: 60000 })
    await expect(popover).toHaveCount(0)
    await expect(page.getByLabel('Message')).toBeEnabled()
  })
})
