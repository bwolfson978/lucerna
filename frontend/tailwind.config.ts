import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        serif: ["'Playfair Display'", "Georgia", "serif"],
        ui: ["'Inter'", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": [
          "clamp(3rem, 7vw, 5.4rem)",
          { lineHeight: "1.04", letterSpacing: "-0.015em", fontWeight: "600" },
        ],
        display: [
          "clamp(2.1rem, 4.4vw, 3.4rem)",
          { lineHeight: "1.06", letterSpacing: "-0.015em", fontWeight: "600" },
        ],
        h1: [
          "30px",
          { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        h2: ["18px", { lineHeight: "1.3", fontWeight: "500" }],
        h3: ["16px", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        caption: [
          "13px",
          { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" },
        ],
        "data-lg": [
          "28px",
          { lineHeight: "1.0", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "data-xs": [
          "12px",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "data-sm": [
          "16px",
          { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
        "data-hero": [
          "40px",
          { lineHeight: "1.0", letterSpacing: "-0.02em", fontWeight: "800" },
        ],
        "data-hero-sm": [
          "28px",
          { lineHeight: "1.0", letterSpacing: "-0.02em", fontWeight: "800" },
        ],
      },
      colors: {
        bg: {
          DEFAULT: "hsl(var(--background))",
          alt: "hsl(var(--background-alt))",
          elevated: "hsl(var(--background-elevated))",
          hover: "hsl(var(--background-hover))",
        },
        border: {
          DEFAULT: "hsl(var(--border))",
          emphasis: "hsl(var(--border-emphasis))",
        },
        text: {
          primary: "hsl(var(--foreground))",
          secondary: "hsl(var(--muted-foreground))",
          tertiary: "hsl(var(--tertiary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          hover: "hsl(var(--accent-hover))",
          light: "hsl(var(--accent-light))",
          muted: "hsl(var(--accent-muted))",
        },
        // "Paper & Pine" brand palette
        ink: {
          DEFAULT: "#141414",
          soft: "#3d3d3d",
          muted: "#737373",
        },
        paper: {
          DEFAULT: "#fafafa",
          warm: "#f0ede6",
          deep: "#e9e5dc",
          stone: "#cfc9ba",
        },
        pine: {
          DEFAULT: "#1b4332",
          deep: "#0b1d15",
          mid: "#2d6a4f",
          line: "#1e3a2e",
          mist: "#8fae9c",
          haze: "#b9c9bd",
        },
        ember: "#f26522",
        bracket: {
          "10": "#4f8f6f",
          "12": "#7fae8f",
          "22": "#c9a443",
          "24": "#e58a3c",
          "32": "#f26522",
          "35": "#cf4a17",
          "37": "#a3360f",
        },
        optimal: "hsl(var(--optimal))",
        negative: "hsl(var(--destructive))",
        neutral: "hsl(var(--neutral))",
        caution: "#c9a443",
        sage: "#66a183",
        // Subtle surface tints (legacy name kept for existing components)
        glass: {
          bg: "rgba(20, 20, 20, 0.03)",
          "bg-hover": "rgba(20, 20, 20, 0.05)",
          border: "#e4e0d6",
          "border-hover": "#cfc9ba",
        },
        // shadcn semantic tokens
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        ring: "hsl(var(--ring))",
      },
      maxWidth: {
        content: "1080px",
        wide: "1180px",
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        md: "16px",
        lg: "20px",
        xl: "24px",
      },
      spacing: {
        micro: "4px",
        tight: "8px",
        default: "16px",
        comfortable: "20px",
        section: "32px",
        "section-lg": "48px",
        page: "64px",
      },
      boxShadow: {
        card: "0 24px 60px -34px rgba(27, 67, 50, 0.28)",
        "card-hover": "0 22px 44px -24px rgba(27, 67, 50, 0.3)",
        elevated: "0 16px 40px -12px rgba(11, 29, 21, 0.22)",
      },
    },
  },
  plugins: [],
};

export default config;
