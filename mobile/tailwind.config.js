/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Keep the mobile bundle compatible with utilities used by the web UI.
      // The mobile app currently builds with Tailwind 3 while the web app uses Tailwind 4.
      backgroundImage: {
        "linear-to-l": "linear-gradient(to left, var(--tw-gradient-stops))",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      spacing: {
        4.5: "1.125rem",
      },
      scale: {
        97: ".97",
        98: ".98",
      },
      colors: {
        slate: {
          950: "#101419",
          900: "#171d25",
          800: "#29313c",
          700: "#3b4654",
        },
        border: "hsl(var(--border, 214.3 31.8% 91.4%))",
        input: "hsl(var(--input, 214.3 31.8% 91.4%))",
        ring: "rgb(var(--primary-rgb) / <alpha-value>)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "rgb(var(--primary-rgb) / <alpha-value>)",
          hover: "rgb(var(--primary-rgb) / 0.9)",
          foreground: "#ffffff",
          50: "rgb(var(--primary-rgb) / 0.05)",
          100: "rgb(var(--primary-rgb) / 0.1)",
          200: "rgb(var(--primary-rgb) / 0.2)",
          500: "rgb(var(--primary-rgb) / <alpha-value>)",
          600: "#0c4a5e",
          700: "#093848",
        },
        secondary: {
          DEFAULT: "#f1f5f9",
          foreground: "#0f172a",
        },
        muted: {
          DEFAULT: "#f1f5f9",
          foreground: "#64748b",
        },
        accent: {
          DEFAULT: "#e0f2fe",
          foreground: "#0369a1",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#0f172a",
        },
      },
      borderRadius: {
        xs: "0.125rem",
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
