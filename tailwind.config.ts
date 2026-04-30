import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          panel: "#12161c",
          row: "#161b22",
          border: "#1f2630",
        },
        text: {
          primary: "#e6edf3",
          secondary: "#8b949e",
          muted: "#6e7681",
        },
        bid: {
          DEFAULT: "#26a69a",
          bar: "rgba(38, 166, 154, 0.18)",
        },
        ask: {
          DEFAULT: "#ef5350",
          bar: "rgba(239, 83, 80, 0.18)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
