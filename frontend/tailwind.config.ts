import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // SnapBase neon palette
        neon: {
          blue: "#00b4ff",
          cyan: "#00f5d4",
          green: "#00ff88",
        },
        navy: {
          DEFAULT: "#0a0f1e",
          50: "#0d1526",
          100: "#111827",
          200: "#1a2540",
          300: "#1e293b",
          400: "#243048",
        },
      },
      fontFamily: {
        inter: ["var(--font-inter)", "system-ui", "sans-serif"],
        grotesk: ["var(--font-grotesk)", "var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "'Courier New'", "monospace"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      backgroundImage: {
        "gradient-neon": "linear-gradient(135deg, #00b4ff, #00f5d4)",
        "gradient-neon-v": "linear-gradient(180deg, #00b4ff, #00f5d4)",
        "gradient-navy": "linear-gradient(135deg, #0a0f1e, #0d1526)",
        "gradient-card": "linear-gradient(135deg, rgba(0,180,255,0.06), rgba(0,245,212,0.04))",
      },
      boxShadow: {
        neon: "0 0 20px rgba(0, 180, 255, 0.25)",
        "neon-lg": "0 0 40px rgba(0, 180, 255, 0.3)",
        "neon-cyan": "0 0 20px rgba(0, 245, 212, 0.25)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.4)",
        card: "0 4px 24px rgba(0, 0, 0, 0.3)",
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 180, 255, 0.2)" },
          "50%": { boxShadow: "0 0 40px rgba(0, 180, 255, 0.5)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
