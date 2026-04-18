import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        kurator: {
          bg: "var(--kurator-bg)",
          surface: "var(--kurator-surface)",
          border: "var(--kurator-border)",
          accent: "var(--kurator-accent)",
          muted: "var(--kurator-muted)",
          fg: "var(--kurator-fg)",
          onAccent: "var(--kurator-on-accent)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
