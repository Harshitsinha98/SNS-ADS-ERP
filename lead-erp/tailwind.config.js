/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0E1116", soft: "#161B22", line: "#2A313C" },
        paper: { DEFAULT: "#F7F5F0", card: "#FFFFFF", line: "#E6E1D6" },
        signal: { DEFAULT: "#FF8A1E", soft: "#FFE8D1" },
        ok: { DEFAULT: "#2BAE66", soft: "#DCF3E7" },
        danger: { DEFAULT: "#E14B4B", soft: "#FBE3E3" },
        info: { DEFAULT: "#3E7CB1", soft: "#DCEAF5" },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,17,22,0.04), 0 1px 1px rgba(14,17,22,0.03)",
      },
    },
  },
  plugins: [],
};