import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // Use a preinstalled Chromium when provided (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium).
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: [
    {
      // AGENT_OFFLINE=1 swaps the model for a rule-based stand-in (no API key needed).
      // AGENT_MCP_URL makes the web assistant reach its tools over HTTP through /mcp,
      // the same way Claude and ChatGPT do.
      command:
        'cd ../backend && AGENT_OFFLINE=1 AGENT_MCP_URL=http://localhost:8000/mcp uvicorn app.main:app --port 8000',
      port: 8000,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'cd ../frontend && npm run dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
})
