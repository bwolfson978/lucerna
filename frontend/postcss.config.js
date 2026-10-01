module.exports = {
  plugins: {
    // Inlines the shared tokens (ui/styles/tokens.css) before Tailwind runs.
    "postcss-import": {},
    tailwindcss: {},
    autoprefixer: {},
  },
}
