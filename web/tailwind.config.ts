import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pink: {
          50:  "#fff0f6",
          100: "#ffe0ee",
          200: "#ffc2de",
          300: "#ff91c0",
          400: "#ff4f96",
          500: "#ff1a6c",
          600: "#f0004f",
          700: "#cc003f",
          800: "#a80038",
          900: "#8a0034",
        },
        surface: {
          DEFAULT: "#0d0d18",
          50:  "#f5f5fa",
          100: "#e8e8f0",
          200: "#c5c5d8",
          300: "#9898b8",
          400: "#6565a0",
          500: "#3d3d6e",
          600: "#2a2a50",
          700: "#1e1e3a",
          800: "#141428",
          900: "#0d0d18",
          950: "#080812",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "pink-glow": "radial-gradient(ellipse at 50% 0%, rgba(255,26,108,0.25) 0%, transparent 60%)",
        "pink-glow-sm": "radial-gradient(ellipse at 50% 0%, rgba(255,26,108,0.15) 0%, transparent 50%)",
        "hero-gradient": "linear-gradient(135deg, #0d0d18 0%, #1a0e20 50%, #0d0d18 100%)",
        "card-gradient": "linear-gradient(135deg, rgba(255,26,108,0.08) 0%, transparent 60%)",
      },
      animation: {
        "fade-up": "fadeUp 0.6s ease forwards",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-12px)" },
        },
      },
      boxShadow: {
        "pink-sm":  "0 0 20px rgba(255,26,108,0.15)",
        "pink-md":  "0 0 40px rgba(255,26,108,0.25)",
        "pink-lg":  "0 0 80px rgba(255,26,108,0.35)",
        "card":     "0 4px 24px rgba(0,0,0,0.4)",
        "card-hover": "0 8px 40px rgba(0,0,0,0.5), 0 0 20px rgba(255,26,108,0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
