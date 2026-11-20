// Opens every built preview the way the design system page frames it (tokens.css, bundle.css,
// React 18 and bundle.js preloaded), fails on an error or an empty render, and saves a
// screenshot of each at desktop and phone width under out/shots/<width>/<Comp>.png.
// Run build.mjs first. Usage: node check.mjs [--out <dir>] [--deps <checkout whose node_modules to use>] [--widths 1000,390] [Comp ...]
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const skill = dirname(here);
const repo = resolve(skill, "../../..");
const flags = ["out", "widths", "deps"];
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const only = args.filter((a, i) => !a.startsWith("--") && !flags.includes(args[i - 1]?.slice(2)));
const outRoot = resolve(arg("out", join(skill, "out")));
const project = join(outRoot, "project");
const widths = arg("widths", "1000,390").split(",").map(Number);
const depsRoot = resolve(arg("deps", repo));

// Playwright: the e2e package's copy, else one installed for the whole machine.
let chromium;
for (const from of [join(depsRoot, "e2e/package.json"), import.meta.url]) {
  try {
    ({ chromium } = createRequire(from)(from.endsWith("package.json") ? "@playwright/test" : "playwright"));
    break;
  } catch {}
}
if (!chromium) throw new Error("Playwright not found: run `npm ci` in e2e/ (see the setup-lucerna skill)");

// The page loads React 18 for previews, whatever the app itself is on.
const REACT = "18.3.1";
const lib = join(outRoot, ".cache", `react-${REACT}`);
const exists = (p) => access(p).then(() => true, () => false);
for (const pkg of ["react", "react-dom"]) {
  const file = join(lib, `${pkg}.production.min.js`);
  if (await exists(file)) continue;
  await mkdir(lib, { recursive: true });
  const tarball = execFileSync("npm", ["pack", `${pkg}@${REACT}`, "--pack-destination", lib, "--silent"]).toString().trim();
  execFileSync("tar", ["-xzf", join(lib, tarball), "-C", lib, "--strip-components=2", `package/umd/${pkg}.production.min.js`]);
}

const url = (p) => `file://${resolve(p)}`;
const head = `<link rel="stylesheet" href="${url(join(project, "tokens.css"))}"><link rel="stylesheet" href="${url(join(project, "components/bundle.css"))}"><script src="${url(join(lib, "react.production.min.js"))}"></script><script src="${url(join(lib, "react-dom.production.min.js"))}"></script><script src="${url(join(project, "components/bundle.js"))}"></script>`;
const theme = JSON.parse(await readFile(join(project, "tokens.json"), "utf8")).color.themes[0].id;

// A preinstalled Chromium when given one (setup-lucerna's env.sh sets PW_CHROMIUM_PATH).
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
);
const report = {};
const problems = [];
for (const width of widths) {
  const shots = join(outRoot, "shots", String(width));
  await mkdir(shots, { recursive: true });
  const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 2 });
  for (const name of (await readdir(join(project, "components"))).sort()) {
    if (only.length && !only.includes(name)) continue;
    const src = await readFile(join(project, "components", name, "preview.html"), "utf8").catch(() => null);
    if (!src) continue;
    const errors = [];
    page.removeAllListeners("pageerror");
    page.removeAllListeners("console");
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const marker = Number(/@dsCard[^>]*height=(\d+)/.exec(src)?.[1] ?? 120);
    await page.setViewportSize({ width, height: marker });
    const file = join(shots, `_${name}.html`);
    await writeFile(file, src.replace(/<html([^>]*)>/, `<html$1 data-theme="${theme}">`).replace("<head>", `<head>${head}`));
    await page.goto(url(file));
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const height = await page.evaluate(() => document.body.offsetHeight);
    await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
    for (const e of errors) problems.push(`${name} at ${width}px: ${e}`);
    if (height < 20) problems.push(`${name} at ${width}px rendered nothing`);
    (report[name] ??= {})[width] = { cardHeight: marker, renderedHeight: height, errors: errors.length };
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ shots: join(outRoot, "shots"), previews: report, problems }, null, 1));
if (problems.length) process.exit(1);
