// Compile each View into one self-contained HTML file (inline script, no imports),
// written to backend/app/mcp/views/ where the MCP server serves it as a ui:// resource.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../backend/app/mcp/views");
const VIEWS = ["result-card"];

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

await mkdir(outDir, { recursive: true });
for (const name of VIEWS) {
  const result = await build({
    entryPoints: [resolve(here, `src/${name}.ts`)],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    write: false,
    legalComments: "none",
    plugins: [englishOnlyZod],
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const template = await readFile(resolve(here, `src/${name}.html`), "utf8");
  const html = template.replace("/*__BUNDLE__*/", () => js);
  await writeFile(resolve(outDir, `${name}.html`), html);
  console.log(`${name}.html  ${(html.length / 1024).toFixed(1)} KB`);
}
