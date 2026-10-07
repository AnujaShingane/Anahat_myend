/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "Inter", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"],
        script: ["Dancing Script", "cursive"],
      },
      colors: {
        cyan: {
          DEFAULT: "#0F8594",
          strong: "#0A6976",
        },
        sunset: {
          DEFAULT: "#E85D35",
          strong: "#C84A28",
        },
        charcoal: "#292D32",
      },
    },
  },
  plugins: [],
};
