import { test, expect } from '@playwright/test'

test.describe('Mobile responsiveness', () => {
  // These tests only run on the Mobile Chrome project
  test('no horizontal scroll on mobile viewport', async ({ page }) => {
    await page.goto('/')

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('calculator form is usable on mobile', async ({ page }) => {
    await page.goto('/')

    // The main CTA should be visible and tappable
    const cta = page.getByRole('link', { name: /calculate|get started|start|demo/i })
    await expect(cta).toBeVisible()

    // Check that the CTA is not cut off
    const box = await cta.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      const viewport = page.viewportSize()
      expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width)
    }
  })
})
