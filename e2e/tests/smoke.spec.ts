import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('backend health check returns ok', async ({ request }) => {
    const response = await request.get('http://localhost:8000/health')
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  test('frontend loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Lucerna/)
  })

  test('frontend can reach backend', async ({ page }) => {
    await page.goto('/')
    // The page should load without network errors to the backend
    const response = await page.request.get('http://localhost:8000/health')
    expect(response.ok()).toBeTruthy()
  })
})
