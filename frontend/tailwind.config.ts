import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'Manrope'", "system-ui", "sans-serif"],
        serif: ["'DM Serif Display'", "Georgia", "serif"],
        ui: ["'Inter'", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": [
          "48px",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "800" },
        ],
        display: [
          "36px",
          { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        h1: [
          "24px",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" },
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
        "data-hero": [
          "40px",
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
        purple: {
          DEFAULT: "#6C5CE7",
          light: "rgba(108, 92, 231, 0.15)",
          muted: "rgba(108, 92, 231, 0.08)",
        },
        bracket: {
          "10": "#4ADE80",
          "12": "#86EFAC",
          "22": "#FBBF24",
          "24": "#FB923C",
          "32": "#F87171",
          "35": "#EF4444",
          "37": "#DC2626",
        },
        optimal: "hsl(var(--optimal))",
        negative: "hsl(var(--destructive))",
        neutral: "hsl(var(--neutral))",
        caution: "#FBBF24",
        sage: "#A8C5A0",
        seaglass: "#7EC8C8",
        rose: "#E8837C",
        trust: "#4A6FA5",
        glass: {
          bg: "rgba(255, 255, 255, 0.04)",
          "bg-hover": "rgba(255, 255, 255, 0.07)",
          border: "rgba(255, 255, 255, 0.08)",
          "border-hover": "rgba(255, 255, 255, 0.15)",
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
        card: "0 2px 8px rgba(15, 14, 26, 0.3)",
        "card-hover":
          "0 8px 24px rgba(15, 14, 26, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.12)",
        elevated: "0 12px 40px rgba(15, 14, 26, 0.5)",
        "glow-gold": "0 0 20px rgba(240, 198, 116, 0.15)",
        "glow-purple": "0 0 20px rgba(108, 92, 231, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
