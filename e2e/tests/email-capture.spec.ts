import { test, expect } from '@playwright/test'

test.describe('Email capture', () => {
  test('submits email and shows confirmation', async ({ page }) => {
    await page.goto('/')

    // Find and fill email input
    const emailInput = page.getByPlaceholder(/email/i)
    await emailInput.fill('alex@example.com')

    // Submit
    const submitBtn = page.getByRole('button', { name: /save|submit|sign up|get results/i })
    await submitBtn.click()

    // Should show success feedback
    await expect(page.getByText(/thank|saved|success|sent/i)).toBeVisible({ timeout: 5000 })
  })
})
