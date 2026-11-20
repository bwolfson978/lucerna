// Builds every file of the Paper & Pine design system page from this checkout into out/project:
//   components/bundle.js   one classic script assigning window.LucernaUI (React from window)
//   components/bundle.css  ui/styles/tokens.css + Tailwind utilities, colours reading the tokens' CSS variables
//   components/<Comp>/preview.html  from ../previews/<Comp>.html, with data from shared/fixtures/view-data.json
//   tokens.css             the CSS variables, compiled from tokens.json the way the page would
//   everything in ../system (brand README, tokens.json, component notes, index.d.ts), copied
// and out/publish.json, the file list to publish. See ../SKILL.md.
// Usage: node build.mjs [--repo <checkout>] [--out <dir>] [--deps <checkout whose node_modules to use>]
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const skill = dirname(here);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const repo = resolve(arg("repo", join(skill, "../../..")));
const outRoot = resolve(arg("out", join(skill, "out")));
const out = join(outRoot, "project");
const depsRoot = resolve(arg("deps", repo));
const systemDir = join(skill, "system");
const previewDir = join(skill, "previews");
const problems = []; // anything here fails the build

const NAMESPACE = "LucernaUI";
// Card order in the design system. Everything else the entry exports is a helper.
const COMPONENTS = [
  "Stat", "MetricCard", "ResultCard", "ConversionSlider", "MostSavingsNote", "ConversionStrip",
  "BracketChart", "BracketFillChart", "ScenarioCompareCard", "PaidVsAvoided", "ScenarioSummary",
  "Steps", "Button", "Card", "Input", "Label", "Select", "Switch", "Tooltip", "Skeleton", "Collapsible",
];
const KIT = ["button", "card", "input", "label", "select", "switch", "tooltip", "skeleton", "collapsible"];

const viewsRequire = createRequire(join(depsRoot, "mcp-views/package.json"));
const { build } = viewsRequire("esbuild");
const postcss = viewsRequire("postcss");
const postcssImport = viewsRequire("postcss-import");
const tailwindcss = viewsRequire("tailwindcss");

const preset = (await import(pathToFileURL(join(repo, "ui/tailwind/preset.js")).href)).default;

const sha = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"]).toString().trim();
const exists = async (p) => !!(await readFile(p).catch(() => null));

// ── bundle.js ─────────────────────────────────────────────────────────
const available = [];
for (const k of KIT) if (await exists(join(repo, `frontend/src/components/ui/${k}.tsx`))) available.push(k);
const entry = [
  `export * from ${JSON.stringify(join(repo, "ui/src/index.ts"))};`,
  ...available.map((k) => `export * from ${JSON.stringify(join(repo, `frontend/src/components/ui/${k}.tsx`))};`),
].join("\n");

const reactGlobals = {
  name: "react-globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => ({ path: a.path, namespace: "react-global" }));
    b.onLoad({ filter: /.*/, namespace: "react-global" }, (a) => {
      if (a.path === "react") return { contents: "module.exports = window.React;" };
      if (a.path === "react-dom" || a.path === "react-dom/client")
        return { contents: "module.exports = window.ReactDOM;" };
      if (a.path === "react/jsx-runtime" || a.path === "react/jsx-dev-runtime")
        return {
          contents: `var R = window.React;
function jsx(type, props, key) {
  var p = {}, children;
  for (var k in props) { if (k === "children") children = props[k]; else p[k] = props[k]; }
  if (key !== undefined) p.key = key;
  if (children === undefined) return R.createElement(type, p);
  return Array.isArray(children) ? R.createElement.apply(R, [type, p].concat(children)) : R.createElement(type, p, children);
}
module.exports = { jsx: jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };`,
        };
      throw new Error(`No global for ${a.path}`);
    });
  },
};

const js = await build({
  stdin: { contents: entry, resolveDir: join(depsRoot, "frontend"), loader: "ts" },
  absWorkingDir: join(depsRoot, "frontend"),
  alias: { "@": join(repo, "frontend/src"), "@lucerna/ui": join(repo, "ui/src/index.ts") },
  nodePaths: [join(depsRoot, "frontend/node_modules")],
  plugins: [reactGlobals],
  jsx: "automatic",
  bundle: true,
  format: "iife",
  globalName: `window.${NAMESPACE}`,
  target: "es2020",
  minify: true,
  write: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
});
let bundle = js.outputFiles[0].text;
if (/<\/script|<!--/i.test(bundle)) bundle = bundle.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const exportedValues =
  new Function("window", `${bundle}; return window.${NAMESPACE};`)({
    React: viewsRequire("preact/compat"),
    ReactDOM: {},
    matchMedia: () => ({ matches: false }),
  }) ?? {};
const exported = new Set(Object.keys(exportedValues));
const components = COMPONENTS.filter((c) => exported.has(c));
for (const c of COMPONENTS) if (!exported.has(c)) problems.push(`${c} is listed in COMPONENTS but the code no longer exports it`);
// A shared card exported from ui/src with no entry here would be missing from the page.
const uiIndex = await readFile(join(repo, "ui/src/index.ts"), "utf8");
const uiNames = [...uiIndex.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) =>
  m[1].split(",").map((part) => part.trim()).filter((part) => part && !part.startsWith("type ")).map((part) => part.split(/\s+as\s+/).pop())
);
const HELPERS = new Set([]); // exported components that are parts of a card, not cards of their own
for (const name of uiNames)
  if (/^[A-Z][a-z]/.test(name) && typeof exportedValues[name] === "function" && !COMPONENTS.includes(name) && !HELPERS.has(name))
    problems.push(`${name} is exported from ui/src/index.ts but has no card: add it to COMPONENTS, previews/${name}.html and system/components/${name}/README.md, or to HELPERS`);
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components: components.map((name) => ({ name })) })} */\n`;
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "components"), { recursive: true });
await writeFile(join(out, "components/bundle.js"), header + bundle);

// ── bundle.css ────────────────────────────────────────────────────────
// Colours go through the design system's CSS variables (its tokens.css), with the
// repo's value as the fallback, so a token edited on the page restyles the previews.
const tokens = JSON.parse(await readFile(join(systemDir, "tokens.json"), "utf8"));
const tokenNames = new Set(tokens.color.tokens.map((t) => t.name));
const rootVars = {};
const tokensCss = await readFile(join(repo, "ui/styles/tokens.css"), "utf8");
for (const m of tokensCss.matchAll(/--([a-z-]+):\s*([^;]+);/g)) rootVars[m[1]] = m[2].trim();

function viaToken(name, fallback) {
  if (!tokenNames.has(name)) return fallback;
  const ref = `var(--${name}, ${fallback})`;
  return ({ opacityValue }) =>
    opacityValue === undefined ? ref : `hsl(from ${ref} h s l / calc(alpha * ${opacityValue}))`;
}
function mapColors(group, prefix = "") {
  const mapped = {};
  for (const [key, value] of Object.entries(group)) {
    const name = key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key;
    if (typeof value !== "string") mapped[key] = mapColors(value, name);
    else {
      const viaVar = /^hsl\(var\(--([a-z-]+)\)\)$/.exec(value);
      mapped[key] = viaVar
        ? viaToken(viaVar[1], `hsl(${rootVars[viaVar[1]]})`)
        : viaToken(name, value);
    }
  }
  return mapped;
}
const dsPreset = {
  ...preset,
  theme: { ...preset.theme, extend: { ...preset.theme.extend, colors: mapColors(preset.theme.extend.colors) } },
};

const fontsUrl = `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap`;
// Without the :root block: the design system's own tokens.css declares those variables.
// Raw hsl(var(--x)) in the stylesheet becomes var(--x, hsl(...)) for the same reason.
const componentCss = tokensCss
  .replace(/:root\s*\{[^}]*\}/, "")
  .replace(/hsl\(var\(--([a-z-]+)\)\)/g, (all, name) =>
    tokenNames.has(name) && rootVars[name] ? `var(--${name}, hsl(${rootVars[name]}))` : all
  );
// Same order as frontend/src/app/globals.css: the shared stylesheet, then Tailwind.
const input = `${componentCss}
@tailwind base;
@layer base {
  body { @apply bg-bg font-sans text-body text-text-primary antialiased; }
  ::selection { background: #1b4332; color: #fff; }
}
@tailwind components;
@tailwind utilities;
`;
const css = await postcss([
  postcssImport(),
  tailwindcss({
    presets: [dsPreset],
    content: [
      join(repo, "ui/src/**/*.{ts,tsx}"),
      join(repo, "frontend/src/components/ui/*.tsx"),
      join(previewDir, "*.html"),
    ],
  }),

]).process(input, { from: join(repo, "ui/styles/tokens.css") });
await writeFile(
  join(out, "components/bundle.css"),
  `/* Paper & Pine component styles: ui/styles/tokens.css + Tailwind utilities compiled with ui/tailwind/preset.js (lucerna@${sha}). Semantic colours read the tokens' CSS variables. */\n@import url("${fontsUrl}");\n${css.css.replace(/<\/style/gi, "<\\/style")}`
);

// ── previews ──────────────────────────────────────────────────────────
const view = JSON.parse(await readFile(join(repo, "shared/fixtures/view-data.json"), "utf8"));
const analyze = view.analyze_roth_conversions;
const FIXTURES = {
  resultCard: analyze.structured_content,
  resultDetails: analyze.view_meta,
  bracketFill: analyze.view_meta.bracket_fill,
  slider: {
    best: analyze.structured_content.total_conversion,
    points: analyze.view_meta.curve.points.map(({ total, savings }) => ({ total, savings })),
  },
  compare: view.compare_roth_scenarios.structured_content,
  scenario: view.prepare_scenario.structured_content,
};
const safe = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
let previews = 0;
for (const file of await readdir(previewDir)) {
  if (!file.endsWith(".html")) continue;
  const name = file.replace(/\.html$/, "");
  let html = await readFile(join(previewDir, file), "utf8");
  html = html.replace(/\/\*@fixture ([\w, ]+)\*\//, (_, keys) => {
    const picked = {};
    for (const k of keys.split(",").map((s) => s.trim())) {
      if (!(k in FIXTURES)) throw new Error(`${file}: unknown fixture ${k}`);
      picked[k] = FIXTURES[k];
    }
    return `var F=${safe(picked)};`;
  });
  await mkdir(join(out, "components", name), { recursive: true });
  await writeFile(join(out, "components", name, "preview.html"), html);
  previews++;
}

for (const c of components) {
  if (!(await exists(join(previewDir, `${c}.html`)))) problems.push(`${c} has no previews/${c}.html`);
  if (!(await exists(join(systemDir, "components", c, "README.md"))))
    problems.push(`${c} has no system/components/${c}/README.md`);
}

// ── token values must match the code ──────────────────────────────────
const numbers = (v) => (String(v).match(/-?\d*\.?\d+/g) ?? []).map(Number).join(",");
const flat = {};
(function walk(group, prefix) {
  for (const [key, value] of Object.entries(group)) {
    const name = key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key;
    if (typeof value === "string") flat[name] = value;
    else walk(value, name);
  }
})(preset.theme.extend.colors, "");
const unchecked = [];
for (const t of tokens.color.tokens) {
  if (rootVars[t.name]) {
    if (numbers(t.value) !== numbers(rootVars[t.name]))
      problems.push(`colour ${t.name} is ${t.value} in system/tokens.json but ${rootVars[t.name]} in ui/styles/tokens.css`);
  } else if (flat[t.name] && !flat[t.name].includes("var(")) {
    if (t.value.replace(/\s/g, "").toLowerCase() !== flat[t.name].replace(/\s/g, "").toLowerCase())
      problems.push(`colour ${t.name} is ${t.value} in system/tokens.json but ${flat[t.name]} in ui/tailwind/preset.js`);
  } else unchecked.push(t.name);
}

// ── tokens.css ────────────────────────────────────────────────────────
// The page is read-only ("editing": "code"), so it never writes this file itself. Laid out
// the way the page compiles it: colours and shadows on the first theme, then the rest.
const note = (usage) => (usage ? ` /* ${usage.replace(/\*\//g, "* /").replace(/<\//g, "< /").replace(/\s+/g, " ").trim()} */` : "");
const theme = tokens.color.themes[0].id;
const first = (v) => (typeof v === "string" ? v : v[theme]);
const alias = (v) => /^\{(.+)\}$/.exec(v)?.[1];
const lines = [`/* ${tokens.name} — generated from tokens.json */`, `:root, [data-theme="${theme}"] {`];
for (const t of tokens.color.tokens) {
  const v = first(t.value);
  lines.push(`  --${t.name}: ${alias(v) ? `var(--${alias(v)})` : v};${note(t.usage)}`);
}
for (const t of tokens.shadow?.tokens ?? []) lines.push(`  --${t.name}: ${first(t.value)};${note(t.usage)}`);
lines.push("}", ":root {");
const other = Object.entries(tokens).filter(
  ([key, family]) => !["color", "type", "spacing", "radius", "shadow", "meta"].includes(key) && Array.isArray(family?.tokens)
);
for (const family of [tokens.spacing, tokens.radius, ...other.map(([, f]) => f)])
  for (const t of family?.tokens ?? []) lines.push(`  --${t.name}: ${t.value};${note(t.usage)}`);
for (const [key, stack] of Object.entries(tokens.type.families)) lines.push(`  --font-${key}: ${stack};`);
const colourNames = new Set(tokens.color.tokens.map((t) => t.name));
const styles = tokens.type.groups.flatMap((g) => g.styles.map((s) => ({ ...s, family: s.family || g.family })));
for (const s of styles) {
  if (colourNames.has(`text-${s.name}`)) continue;
  const italic = s.fontStyle && s.fontStyle !== "normal" ? `${s.fontStyle} ` : "";
  lines.push(`  --text-${s.name}: ${italic}${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.family ? `var(--font-${s.family})` : "inherit"};${note(s.usage)}`);
}
lines.push("}");
for (const s of styles)
  lines.push(
    `.${s.name} {`,
    ...(s.family ? [`  font-family: var(--font-${s.family});`] : []),
    `  font-size: ${s.fontSize};`,
    `  line-height: ${s.lineHeight};`,
    `  font-weight: ${s.fontWeight};`,
    `  letter-spacing: ${s.letterSpacing ?? "normal"};`,
    ...(s.fontStyle && s.fontStyle !== "normal" ? [`  font-style: ${s.fontStyle};`] : []),
    "}"
  );
await writeFile(join(out, "tokens.css"), lines.join("\n") + "\n");

// ── the hand-written files ────────────────────────────────────────────
// {{sha}} in them becomes the commit this was built from.
const today = new Date().toISOString().slice(0, 10);
async function copySystem(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const from = join(dir, entry.name);
    if (entry.isDirectory()) await copySystem(from);
    else {
      const to = join(out, relative(systemDir, from));
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, (await readFile(from, "utf8")).replaceAll("{{sha}}", sha).replaceAll("{{date}}", today));
    }
  }
}
await copySystem(systemDir);

// ── publish list ──────────────────────────────────────────────────────
// Every built file, by the path the page serves it at. The index (design-system.json) is
// not here: it is read from the page, updated and sent as the publish's file_path.
const files = {};
async function list(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await list(full);
    else {
      const path = relative(outRoot, full).split("\\").join("/");
      if (path === "project/design-system.json") continue;
      files[path] = path.endsWith(".d.ts") ? { from: path, contentType: "text/plain" } : path;
    }
  }
}
await list(out);
await writeFile(join(outRoot, "publish.json"), JSON.stringify(files, null, 1) + "\n");

console.log(
  JSON.stringify(
    { sha, out: outRoot, components, previews, files: Object.keys(files).length, js: bundle.length, css: css.css.length, coloursNotInCode: unchecked, problems },
    null,
    1
  )
);
if (problems.length) process.exit(1);
