#!/usr/bin/env node
/**
 * Capture screenshots (and optionally a video) of named flows against a running Lucerna.
 * Used by the pr-evidence skill to capture the base branch and the PR head the same way.
 *
 *   node capture/capture.mjs --base-url http://localhost:3000 --out <dir> [options]
 *
 *   --flows a,b        flows to run (names in flows.mjs); default: all
 *   --changed <file>   pick flows from a list of changed paths (one per line) instead
 *   --viewports d,m    desktop (1280x800) and/or mobile (Pixel 5); default: both
 *   --video            also record each flow (WebM, desktop only) with a visible cursor
 *   --list             print flow names and the paths that select them, then exit
 *
 * Writes <out>/<viewport>/<flow>--<shot>.png and <out>/manifest.json (caption, flow,
 * viewport and highlight box per shot) for annotate.py. Exits non-zero if a flow fails,
 * after capturing what it could; failures are listed in the manifest.
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { flows, GLOBAL_PATHS } from './flows.mjs'

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: { ...devices['Pixel 5'], deviceScaleFactor: 2 },
}

// A visible cursor for videos: Playwright moves the mouse but draws nothing.
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div')
    dot.style.cssText = 'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(242,101,34,.55);border:2px solid #f26522;pointer-events:none;left:-40px;top:-40px;transition:transform .1s'
    document.body.appendChild(dot)
    addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px' }, true)
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)' }, true)
    addEventListener('mouseup', () => { dot.style.transform = '' }, true)
  })
`

// Next's dev-mode badge is not part of the app; keep it out of every frame.
const HIDE_DEV_OVERLAY = `
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style')
    style.textContent = 'nextjs-portal { display: none !important; }'
    document.head.appendChild(style)
  })
`

/** Hide fixed and sticky elements (header, composer) that would cover a cropped element. */
async function hideOverlays(page, element) {
  const handle = await element.elementHandle()
  await page.evaluate((target) => {
    for (const el of document.querySelectorAll('body *')) {
      const pos = getComputedStyle(el).position
      if ((pos === 'fixed' || pos === 'sticky') && !el.contains(target)) {
        el.dataset.captureHidden = el.style.visibility || 'unset'
        el.style.visibility = 'hidden'
      }
    }
  }, handle)
}

async function restoreOverlays(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-capture-hidden]')) {
      el.style.visibility = el.dataset.captureHidden === 'unset' ? '' : el.dataset.captureHidden
      delete el.dataset.captureHidden
    }
  })
}

function parseArgs(argv) {
  const args = { viewports: ['desktop', 'mobile'] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const next = () => argv[++i]
    if (key === '--base-url') args.baseUrl = next()
    else if (key === '--out') args.out = next()
    else if (key === '--flows') args.flows = next().split(',').filter(Boolean)
    else if (key === '--changed') args.changed = next()
    else if (key === '--viewports') args.viewports = next().split(',').filter(Boolean)
    else if (key === '--video') args.video = true
    else if (key === '--list') args.list = true
    else throw new Error(`unknown option: ${key}`)
  }
  return args
}

/** Flows whose paths prefix-match a changed file; a global path selects every flow. */
export function flowsForChanges(changed) {
  if (changed.some((f) => GLOBAL_PATHS.some((p) => f.startsWith(p)))) return Object.keys(flows)
  return Object.entries(flows)
    .filter(([, flow]) => changed.some((f) => flow.paths.some((p) => f.startsWith(p))))
    .map(([name]) => name)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.list) {
    for (const [name, flow] of Object.entries(flows)) console.log(`${name}\t${flow.paths.join(' ')}`)
    return
  }
  if (!args.baseUrl || !args.out) throw new Error('--base-url and --out are required')

  let names = args.flows ?? Object.keys(flows)
  if (args.changed) {
    const changed = readFileSync(args.changed, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    names = flowsForChanges(changed)
  }
  for (const name of names) if (!flows[name]) throw new Error(`no flow named ${name}`)

  const out = resolve(args.out)
  mkdirSync(out, { recursive: true })
  const manifest = { baseUrl: args.baseUrl, flows: names, shots: [], failures: [], videos: [] }
  if (names.length === 0) {
    writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log('no flow matches the changed files')
    return
  }

  const browser = await chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
  )
  for (const vp of args.viewports) {
    if (!VIEWPORTS[vp]) throw new Error(`unknown viewport ${vp}`)
    const dir = join(out, vp)
    mkdirSync(dir, { recursive: true })
    for (const name of names) {
      const flow = flows[name]
      const record = args.video && vp === 'desktop'
      const videoDir = join(out, 'video-tmp', name)
      const context = await browser.newContext({
        ...VIEWPORTS[vp],
        baseURL: args.baseUrl,
        reducedMotion: 'reduce',
        ...(record ? { recordVideo: { dir: videoDir, size: VIEWPORTS.desktop.viewport } } : {}),
      })
      await context.addInitScript(HIDE_DEV_OVERLAY)
      if (record) await context.addInitScript(CURSOR)
      const page = await context.newPage()
      page.setDefaultTimeout(30000)
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))

      const shot = async (shotName, caption, opts = {}) => {
        const file = `${name}--${shotName}.png`
        const path = join(dir, file)
        // Let fonts, images and any in-view transitions settle before the frame.
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(400)
        let box = null
        if (opts.element) {
          await opts.element.scrollIntoViewIfNeeded()
          await hideOverlays(page, opts.element)
          await opts.element.screenshot({ path, animations: 'disabled' })
          await restoreOverlays(page)
        } else {
          await page.screenshot({ path, fullPage: !!opts.fullPage, animations: 'disabled' })
        }
        if (opts.highlight) {
          const b = await opts.highlight.boundingBox()
          const origin = opts.element ? await opts.element.boundingBox() : { x: 0, y: 0 }
          const scroll = opts.fullPage ? await page.evaluate(() => ({ x: scrollX, y: scrollY })) : { x: 0, y: 0 }
          if (b && origin) box = { x: b.x - origin.x + scroll.x, y: b.y - origin.y + scroll.y, w: b.width, h: b.height }
        }
        manifest.shots.push({
          flow: name,
          flowTitle: flow.title,
          shot: shotName,
          caption,
          viewport: vp,
          file: `${vp}/${file}`,
          scale: VIEWPORTS[vp].deviceScaleFactor,
          highlight: box,
        })
        console.log(`captured ${vp}/${file}`)
      }

      try {
        await flow.run(page, shot)
        if (errors.length) manifest.failures.push({ flow: name, viewport: vp, pageErrors: errors })
      } catch (e) {
        console.error(`flow ${name} (${vp}) failed: ${e.message.split('\n')[0]}`)
        manifest.failures.push({ flow: name, viewport: vp, error: e.message.split('\n')[0], pageErrors: errors })
        await page.screenshot({ path: join(dir, `${name}--FAILED.png`) }).catch(() => {})
      }
      await context.close()
      if (record) {
        const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'))
        if (webm) {
          const target = join(out, `${name}.webm`)
          renameSync(join(videoDir, webm), target)
          manifest.videos.push({ flow: name, file: `${name}.webm` })
        }
      }
    }
  }
  await browser.close()
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`manifest: ${join(out, 'manifest.json')}`)
  if (manifest.failures.some((f) => f.error)) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(2)
  })
}
