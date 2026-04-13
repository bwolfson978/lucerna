// lint-staged config for the Lucerna monorepo.
//
// Tools must be invoked from the directory where their config lives
// (frontend/ for ESLint+Prettier, backend/ for Ruff) so they resolve
// configs, plugins, and ignore files correctly. We convert the absolute
// paths lint-staged passes to paths relative to each tool's working
// directory before passing files through.

import path from "node:path";

const repoRoot = process.cwd();

const relativeTo = (subdir) => (files) => {
  const base = path.join(repoRoot, subdir);
  return files.map((f) => path.relative(base, path.resolve(f)));
};

export default {
  "frontend/src/**/*.{ts,tsx}": (files) => {
    const rel = relativeTo("frontend")(files).join(" ");
    return [
      `bash -c "cd frontend && npx eslint --fix ${rel}"`,
      `bash -c "cd frontend && npx prettier --write ${rel}"`,
    ];
  },
  "frontend/src/**/*.{js,jsx,json,css}": (files) => {
    const rel = relativeTo("frontend")(files).join(" ");
    return [`bash -c "cd frontend && npx prettier --write ${rel}"`];
  },
  "backend/**/*.py": (files) => {
    const rel = relativeTo("backend")(files).join(" ");
    return [
      `bash -c "cd backend && ruff check --fix ${rel}"`,
      `bash -c "cd backend && ruff format ${rel}"`,
    ];
  },
};
