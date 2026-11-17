import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f2f5fa", 100: "#e3e9f3", 200: "#c4d0e4", 300: "#97abcc", 400: "#6480ad",
          500: "#456192", 600: "#344b77", 700: "#2a3c61", 800: "#1d2a46", 900: "#141d33", 950: "#0c1222",
        },
        gold: {
          50: "#fbf8ef", 100: "#f5edd5", 200: "#ead9a8", 300: "#dec174", 400: "#d2aa4c", 500: "#c4933a", 600: "#a9752f", 700: "#875828",
        },
        paper: "#fbfaf7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["'Cormorant Garamond'", "Georgia", "'Times New Roman'", "serif"],
        book: ["Georgia", "'Iowan Old Style'", "'Times New Roman'", "serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(12,18,34,.04), 0 4px 16px rgba(12,18,34,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
