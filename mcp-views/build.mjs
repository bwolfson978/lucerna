// Compile each View into one self-contained HTML file (inline script and styles),
// written to backend/app/mcp/views/ where the MCP server serves it as a ui:// resource.
//
// Views render the shared display components in ../ui, the same ones the web app
// renders natively: React APIs run on preact/compat (a fraction of React's size), and
// the CSS is Tailwind compiled from the shared preset and tokens.
import { build } from "esbuild";
import postcss from "postcss";
import postcssImport from "postcss-import";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import preset from "../ui/tailwind/preset.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../backend/app/mcp/views");
// View entry -> page title. Each builds to backend/app/mcp/views/<name>.html.
const VIEWS = {
  "result-card": "Roth conversion result",
  "scenario-summary": "Your scenario",
  "scenario-compare": "What-if comparison",
};

// Zod ships ~40 translated error locales; Views only need English.
const englishOnlyZod = {
  name: "english-only-zod",
  setup(b) {
    b.onResolve({ filter: /locales\/index\.js$/ }, (args) =>
      args.importer.includes("/zod/") ? { path: "zod-locales", namespace: "stub" } : undefined
    );
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export { default as en } from ${JSON.stringify(
        resolve(here, "node_modules/zod/v4/locales/en.js")
      )};`,
      resolveDir: here,
    }));
  },
};

// ../ui has no node_modules: its imports resolve here (esbuild resolves alias targets
// from the working directory).
const alias = {
  "@lucerna/ui": resolve(here, "../ui/src/index.ts"),
  react: "preact/compat",
  "react-dom": "preact/compat",
  "react-dom/client": "preact/compat/client",
  "react/jsx-runtime": "preact/jsx-runtime",
};

async function compileCss() {
  const from = resolve(here, "src/view.css");
  const css = await postcss([
    postcssImport(),
    tailwindcss({
      presets: [preset],
      content: [resolve(here, "src/**/*.{ts,tsx}"), resolve(here, "../ui/src/**/*.{ts,tsx}")],
    }),
    autoprefixer(),
  ]).process(await readFile(from, "utf8"), { from });
  // Minify lightly: strip comments and collapse whitespace.
  return css.css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/<\/style/gi, "<\\/style")
    .trim();
}

await mkdir(outDir, { recursive: true });
const css = await compileCss();
const template = await readFile(resolve(here, "src/template.html"), "utf8");
for (const [name, title] of Object.entries(VIEWS)) {
  const result = await build({
    entryPoints: [resolve(here, `src/${name}.tsx`)],
    absWorkingDir: here,
    alias,
    jsx: "automatic",
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    write: false,
    legalComments: "none",
    plugins: [englishOnlyZod],
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = template
    .replace("__TITLE__", () => title)
    .replace("/*__CSS__*/", () => css)
    .replace("/*__BUNDLE__*/", () => js);
  await writeFile(resolve(outDir, `${name}.html`), html);
  console.log(`${name}.html  ${(html.length / 1024).toFixed(1)} KB`);
}
