import { test, expect } from '@playwright/test'

test.describe('Demo flow', () => {
  test('loads demo and displays Alex scenario results', async ({ page }) => {
    await page.goto('/')

    // Click the demo CTA
    const demoCta = page.getByRole('button', { name: /see demo|try demo|view example/i })
    await demoCta.click()

    // Should show optimization results
    await expect(page.getByText(/conversion/i)).toBeVisible()
    await expect(page.getByText(/tax/i)).toBeVisible()
  })
})
