/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {},
    colors: {
      cyberpunk: {
        night: "#0B0F1A",
        deepPurple: "#2E1A47",
        neonPink: "#FF3CA6",
        neonBlue: "#00FFFF",
        neonPurple: "#9B59B6",
        neonCyan: "#00D9F5",
        starYellow: "#FFD93D",
        starWhite: "#E9F1F7",
        starBlack: "#2E2660",
      },
    },
  },
  plugins: [],
};
