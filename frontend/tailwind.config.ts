import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Geist Sans'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      fontSize: {
        display: ["36px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        h1: ["28px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        h2: ["22px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        h3: ["17px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.4", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "1.4", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" }],
        "data-lg": ["28px", { lineHeight: "1.0", letterSpacing: "-0.02em", fontWeight: "500" }],
      },
      colors: {
        bg: {
          DEFAULT: "#FFFFFF",
          alt: "#FAFAFA",
          hover: "#F5F5F5",
        },
        border: {
          DEFAULT: "rgba(0, 0, 0, 0.08)",
          emphasis: "rgba(0, 0, 0, 0.15)",
        },
        text: {
          primary: "#0A0A0A",
          secondary: "#6B6B6B",
          tertiary: "#9B9B9B",
        },
        accent: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          light: "#EFF6FF",
        },
        bracket: {
          "10": "#22C55E",
          "12": "#86EFAC",
          "22": "#FACC15",
          "24": "#FB923C",
          "32": "#F87171",
          "35": "#EF4444",
          "37": "#DC2626",
        },
        optimal: "#16A34A",
        negative: "#DC2626",
        neutral: "#6B7280",
      },
      maxWidth: {
        content: "1080px",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "4px",
        md: "6px",
      },
      spacing: {
        micro: "4px",
        tight: "8px",
        default: "12px",
        comfortable: "16px",
        section: "24px",
        "section-lg": "32px",
        page: "48px",
      },
    },
  },
  plugins: [],
};

export default config;
