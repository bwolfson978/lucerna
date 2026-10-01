import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The web app shows its own editable scenario card, so it never mounts the
// record_scenario View on its own; other MCP hosts do. Seed a stored conversation with
// that View's part to check it renders the shared summary from real tool output.
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/fixtures/view-data.json'), 'utf8')
)

test('the record_scenario View renders the shared scenario summary', async ({ page }) => {
  const recorded = fixture.record_scenario.structured_content
  const conversation = {
    messages: [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            kind: 'mcp_app',
            resource_uri: 'ui://roth-conversions/scenario-summary.html',
            tool_name: 'record_scenario',
            tool_input: { scenario: fixture.scenario },
            tool_result: {
              content: [{ type: 'text', text: JSON.stringify(recorded) }],
              structuredContent: recorded,
            },
          },
        ],
      },
    ],
    apiMessages: [],
    results: {},
  }
  await page.addInitScript((value) => {
    sessionStorage.setItem('lucerna:conversation:v1', value)
  }, JSON.stringify(conversation))
  await page.goto('/calculator')

  const summary = page
    .frameLocator('[data-testid=mcp-app] iframe')
    .frameLocator('iframe')
    .locator('[data-ui=scenario-summary]')
  await expect(summary).toBeVisible({ timeout: 30000 })
  await expect(summary.getByText('California, then Arizona')).toBeVisible()
  await expect(summary.getByText(/Sabbatical/)).toBeVisible()
  // This host accepts ui/message, so the complete scenario offers to run.
  await expect(summary.getByRole('button', { name: 'Run the numbers' })).toBeVisible()
})
