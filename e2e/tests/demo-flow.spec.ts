import { test, expect } from '@playwright/test'

test.describe('Demo conversation', () => {
  test('replays Margaret and accepts a follow-up', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'See an example' }).first().click()
    await expect(page).toHaveURL(/\/demo/)

    await expect(page.getByText(/Hi, I'm Margaret/)).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('result-headline')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Ready to try yours?')).toBeVisible({ timeout: 30000 })

    await page.getByLabel('Message').fill('How do RMDs work?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText(/Required Minimum Distributions/i).last()).toBeVisible({ timeout: 20000 })
  })
})
