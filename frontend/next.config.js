const path = require("path")

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared display components live in ../ui (also used by the MCP App Views).
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: { "@lucerna/ui": "../ui/src/index.ts" },
  },
  outputFileTracingRoot: path.join(__dirname, ".."),
}

module.exports = nextConfig
