import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from '../fixtures/test'

// Every spec fails on uncaught page errors (fixtures/test.ts). These keep that true.

test('every spec uses the shared test, which fails on page errors', () => {
  const dir = resolve(__dirname)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.spec.ts'))) {
    const source = readFileSync(resolve(dir, file), 'utf8')
    expect(source, `${file} imports test from '@playwright/test'`).not.toMatch(
      /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*'@playwright\/test'/
    )
    expect(source, `${file} doesn't import test from '../fixtures/test'`).toMatch(
      /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*'\.\.\/fixtures\/test'/
    )
  }
})

test('an uncaught error in the page fails the test', async ({ page }) => {
  // Expected to fail: the fixture's check after the test must catch this error.
  test.fail()
  await page.setContent('<script>setTimeout(() => { throw new Error("boom") })</script>')
  await page.waitForTimeout(200)
})
