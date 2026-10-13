import type { Config } from "tailwindcss";
import preset from "../ui/tailwind/preset.js";

// Theme tokens live in the shared UI package so MCP App Views and the web app match.
const config: Config = {
  presets: [preset as Partial<Config>],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "../ui/src/**/*.{ts,tsx}"],
  plugins: [],
};

export default config;
