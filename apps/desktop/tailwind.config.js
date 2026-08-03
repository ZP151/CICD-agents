/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/streamdown/dist/*.js",
  ],
  theme: {
    extend: {
      fontFamily: {
        // MP-014: semantic stacks from base.css tokens; no web fonts.
        sans: ["var(--font-ui)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        background: "rgb(var(--app-bg) / <alpha-value>)",
        foreground: "rgb(var(--app-text) / <alpha-value>)",
        card: "rgb(var(--app-surface) / <alpha-value>)",
        "card-foreground": "rgb(var(--app-text) / <alpha-value>)",
        muted: "rgb(var(--app-bg-muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--app-text-muted) / <alpha-value>)",
        border: "rgb(var(--app-border) / <alpha-value>)",
        input: "rgb(var(--app-border) / <alpha-value>)",
        primary: "rgb(var(--app-accent) / <alpha-value>)",
        "primary-foreground": "rgb(255 255 255 / <alpha-value>)",
        sidebar: "rgb(var(--app-surface-raised) / <alpha-value>)",
        "sidebar-foreground": "rgb(var(--app-text) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
