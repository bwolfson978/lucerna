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
        display: ["36px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "800" }],
        h1: ["28px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        h2: ["22px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        h3: ["17px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" }],
        "data-lg": ["28px", { lineHeight: "1.0", letterSpacing: "-0.02em", fontWeight: "500" }],
        "data-hero": ["40px", { lineHeight: "1.0", letterSpacing: "-0.02em", fontWeight: "700" }],
      },
      colors: {
        bg: {
          DEFAULT: "hsl(var(--background))",
          alt: "hsl(var(--background-alt))",
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
        bracket: {
          "10": "#22C55E",
          "12": "#86EFAC",
          "22": "#FACC15",
          "24": "#FB923C",
          "32": "#F87171",
          "35": "#EF4444",
          "37": "#DC2626",
        },
        optimal: "hsl(var(--optimal))",
        negative: "hsl(var(--destructive))",
        neutral: "hsl(var(--neutral))",
        // shadcn semantic tokens
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        ring: "hsl(var(--ring))",
      },
      maxWidth: {
        content: "1080px",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "var(--radius)",
        md: "8px",
        lg: "12px",
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
        card: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
        "card-hover": "0 4px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
        elevated: "0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
