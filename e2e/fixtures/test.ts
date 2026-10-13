/**
 * The `test` every spec uses: Playwright's, plus a check that fails the test if any
 * page it opened threw an uncaught error. A render crash can leave a page that still
 * passes the test's own assertions (or show Next's "This page couldn't load" where no
 * assertion looks), so this catches crashes everywhere, not only where a test checks.
 *
 * Import `test` and `expect` from here, not from '@playwright/test'.
 * tests/page-errors.spec.ts checks that every spec does.
 */

import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * Record uncaught errors from every page in `context`, including pages opened later.
 * The fixture does this for the test's own context; call it for any context a test
 * creates itself (browser.newContext()).
 */
export function watchPageErrors(context: BrowserContext, errors: string[]): void {
  const watch = (page: Page) =>
    page.on('pageerror', (error) => {
      errors.push(`${page.url()}\n${error.stack ?? error.message}`)
    })
  context.pages().forEach(watch)
  context.on('page', watch)
}

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ context }, use) => {
      const errors: string[] = []
      watchPageErrors(context, errors)
      await use(errors)
      expect(errors, 'Uncaught errors in the page (see the stacks above)').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
