import { test, expect } from '@playwright/test'

test.describe('Chat flow', () => {
  test('asks a question and gets a response', async ({ page }) => {
    // Mock the Anthropic API at the backend level
    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: 'Based on your inputs, converting in the 22% bracket could save you approximately $15,000 in lifetime taxes.',
        }),
      })
    })

    await page.goto('/')

    // Navigate to or open chat
    const chatTrigger = page.getByRole('button', { name: /ask|chat|question/i })
    await chatTrigger.click()

    // Type a question
    const chatInput = page.getByPlaceholder(/ask|question|type/i)
    await chatInput.fill('Why should I convert to a Roth IRA?')
    await page.getByRole('button', { name: /send|submit/i }).click()

    // Should see the mocked response
    await expect(page.getByText(/22% bracket/i)).toBeVisible({ timeout: 5000 })
  })
})
