import type { Config } from "tailwindcss";

/**
 * Shared Tailwind preset — the design-system bridge (guardrail #8, ws 0.9).
 * Tokens are declared as CSS variables in `@ci/ui` (tokens.css) and surfaced to
 * Tailwind here so EVERY app styles from the same scale. Per-tenant white-label
 * overrides those CSS variables at runtime (tenant_theme.brand_tokens) — no
 * rebuild needed.
 */
export const preset = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--color-background) / <alpha-value>)",
        foreground: "hsl(var(--color-foreground) / <alpha-value>)",
        card: "hsl(var(--color-card) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--color-primary) / <alpha-value>)",
          foreground: "hsl(var(--color-primary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--color-accent) / <alpha-value>)",
          foreground: "hsl(var(--color-accent-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--color-success) / <alpha-value>)",
          foreground: "hsl(var(--color-success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--color-warning) / <alpha-value>)",
          foreground: "hsl(var(--color-warning-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--color-muted) / <alpha-value>)",
          foreground: "hsl(var(--color-muted-foreground) / <alpha-value>)",
        },
        border: "hsl(var(--color-border) / <alpha-value>)",
        ring: "hsl(var(--color-ring) / <alpha-value>)",
        destructive: {
          DEFAULT: "hsl(var(--color-destructive) / <alpha-value>)",
          foreground: "hsl(var(--color-destructive-foreground) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["General Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
    },
  },
} satisfies Partial<Config>;

export default preset;
